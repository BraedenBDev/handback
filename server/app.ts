import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ENVELOPE_SCHEMA, type Envelope } from "../shared/schema.ts";
import { validate } from "../shared/validate.ts";
import { newHandoffId, openDatabase, type StoredEnvelope } from "./db.ts";

const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function createApp(databasePath?: string) {
  const db = openDatabase(databasePath);
  const app = express();
  // 5 MB ceiling: an envelope is bounded by the schema anyway, and an unbounded
  // body parser is free memory exhaustion.
  app.use(express.json({ limit: "5mb" }));

  const readEnvelope = (id: string, version: number): Envelope | undefined => {
    const row = db
      .prepare("SELECT * FROM envelopes WHERE handoffId = ? AND version = ?")
      .get(id, version) as StoredEnvelope | undefined;
    if (!row) return undefined;
    return { format: row.format as Envelope["format"], iv: row.iv, ciphertext: row.ciphertext };
  };

  app.post("/api/h", (req, res) => {
    const envelope = req.body?.envelope;
    const check = validate(envelope, ENVELOPE_SCHEMA);
    if (!check.valid) return res.status(400).json({ error: "invalid_envelope", detail: check.errors });
    const id = newHandoffId();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO handoffs (id, currentVersion, createdAt, updatedAt) VALUES (?, 1, ?, ?)").run(id, now, now);
    db.prepare(
      "INSERT INTO envelopes (handoffId, version, format, iv, ciphertext, createdAt) VALUES (?, 1, ?, ?, ?, ?)",
    ).run(id, envelope.format, envelope.iv, envelope.ciphertext, now);
    res.status(201).json({ id, version: 1 });
  });

  app.get("/api/h/:id", (req, res) => {
    const id = req.params.id;
    if (!ID_PATTERN.test(id)) return res.status(400).json({ error: "invalid_id" });
    const handoff = db.prepare("SELECT * FROM handoffs WHERE id = ?").get(id) as
      | { id: string; currentVersion: number }
      | undefined;
    if (!handoff) return res.status(404).json({ error: "not_found" });

    // ?version=N reads an earlier envelope. Nothing is ever deleted, so an
    // approval that turns out to be wrong can still be recovered from.
    const requested = req.query.version === undefined ? handoff.currentVersion : Number(req.query.version);
    if (!Number.isInteger(requested) || requested < 1) return res.status(400).json({ error: "invalid_version" });

    const envelope = readEnvelope(id, requested);
    if (!envelope) return res.status(404).json({ error: "version_not_found", currentVersion: handoff.currentVersion });
    res.json({ id, version: requested, currentVersion: handoff.currentVersion, envelope });
  });

  app.get("/api/h/:id/versions", (req, res) => {
    const id = req.params.id;
    if (!ID_PATTERN.test(id)) return res.status(400).json({ error: "invalid_id" });
    const rows = db
      .prepare("SELECT version, createdAt FROM envelopes WHERE handoffId = ? ORDER BY version")
      .all(id) as Array<{ version: number; createdAt: string }>;
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ id, versions: rows });
  });

  app.put("/api/h/:id", (req, res) => {
    const id = req.params.id;
    if (!ID_PATTERN.test(id)) return res.status(400).json({ error: "invalid_id" });

    const envelope = req.body?.envelope;
    const check = validate(envelope, ENVELOPE_SCHEMA);
    if (!check.valid) return res.status(400).json({ error: "invalid_envelope", detail: check.errors });

    // expectedVersion is required and ENFORCED. Accepting a version field and
    // then ignoring it turns concurrent contributions into silent lost updates.
    const expectedVersion = req.body?.expectedVersion;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(400).json({ error: "expected_version_required" });
    }

    const handoff = db.prepare("SELECT * FROM handoffs WHERE id = ?").get(id) as
      | { currentVersion: number }
      | undefined;
    if (!handoff) return res.status(404).json({ error: "not_found" });

    if (handoff.currentVersion !== expectedVersion) {
      return res.status(409).json({ error: "version_conflict", currentVersion: handoff.currentVersion, expectedVersion });
    }

    const nextVersion = handoff.currentVersion + 1;
    const now = new Date().toISOString();

    // Insert the envelope FIRST. The (handoffId, version) primary key is the
    // real concurrency guard: two writers racing for the same next version
    // cannot both land, whichever order their SELECTs happened to run in.
    // Same ordering as worker/index.ts, so the two runtimes stay comparable.
    try {
      db.prepare(
        "INSERT INTO envelopes (handoffId, version, format, iv, ciphertext, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, nextVersion, envelope.format, envelope.iv, envelope.ciphertext, now);
    } catch {
      return res.status(409).json({ error: "version_conflict", currentVersion: nextVersion });
    }

    db.prepare("UPDATE handoffs SET currentVersion = ?, updatedAt = ? WHERE id = ? AND currentVersion = ?")
      .run(nextVersion, now, id, expectedVersion);

    res.json({ id, version: nextVersion });
  });

  // Serve the built client when it exists, so one process hosts the whole app.
  // /h/<id> is a client route, so anything that is not /api and not a real file
  // falls back to index.html.
  const clientDirectory = join(import.meta.dirname, "..", "dist");
  if (existsSync(clientDirectory)) {
    app.use(express.static(clientDirectory));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(join(clientDirectory, "index.html"));
    });
  }

  return app;
}

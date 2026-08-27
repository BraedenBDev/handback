import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Ajv } from "ajv";
import { ENVELOPE_SCHEMA } from "../shared/schema.ts";
import { newHandoffId, openDatabase, type StoredHandoff } from "./db.ts";

const ajv = new Ajv({ allErrors: true });
const validateEnvelope = ajv.compile(ENVELOPE_SCHEMA);

const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function createApp(databasePath?: string) {
  const db = openDatabase(databasePath);
  const app = express();
  // 5 MB ceiling: an envelope is bounded by the schema anyway, and an unbounded
  // body parser is free memory exhaustion.
  app.use(express.json({ limit: "5mb" }));

  app.post("/api/h", (req, res) => {
    const envelope = req.body?.envelope;
    if (!validateEnvelope(envelope)) {
      return res.status(400).json({ error: "invalid_envelope", detail: ajv.errorsText(validateEnvelope.errors) });
    }
    const id = newHandoffId();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO handoffs (id, version, envelope, createdAt, updatedAt) VALUES (?, 1, ?, ?, ?)",
    ).run(id, JSON.stringify(envelope), now, now);
    res.status(201).json({ id, version: 1 });
  });

  app.get("/api/h/:id", (req, res) => {
    const id = req.params.id;
    if (!ID_PATTERN.test(id)) return res.status(400).json({ error: "invalid_id" });
    const row = db.prepare("SELECT * FROM handoffs WHERE id = ?").get(id) as StoredHandoff | undefined;
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({ id: row.id, version: row.version, envelope: JSON.parse(row.envelope) });
  });

  app.put("/api/h/:id", (req, res) => {
    const id = req.params.id;
    if (!ID_PATTERN.test(id)) return res.status(400).json({ error: "invalid_id" });

    const envelope = req.body?.envelope;
    if (!validateEnvelope(envelope)) {
      return res.status(400).json({ error: "invalid_envelope", detail: ajv.errorsText(validateEnvelope.errors) });
    }

    // expectedVersion is required and ENFORCED. Accepting a version field and
    // then ignoring it (as an earlier implementation did) turns concurrent
    // contributions into silent lost updates.
    const expectedVersion = req.body?.expectedVersion;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(400).json({ error: "expected_version_required" });
    }

    const row = db.prepare("SELECT * FROM handoffs WHERE id = ?").get(id) as StoredHandoff | undefined;
    if (!row) return res.status(404).json({ error: "not_found" });

    if (row.version !== expectedVersion) {
      return res.status(409).json({
        error: "version_conflict",
        currentVersion: row.version,
        expectedVersion,
      });
    }

    const nextVersion = row.version + 1;
    const now = new Date().toISOString();
    // The WHERE clause repeats the version check so two racing requests that
    // both passed the SELECT cannot both write.
    const result = db.prepare(
      "UPDATE handoffs SET version = ?, envelope = ?, updatedAt = ? WHERE id = ? AND version = ?",
    ).run(nextVersion, JSON.stringify(envelope), now, id, expectedVersion);

    if (result.changes === 0) {
      return res.status(409).json({ error: "version_conflict" });
    }
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

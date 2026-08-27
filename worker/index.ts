/**
 * Production runtime: Cloudflare Worker + D1.
 *
 * This is a straight port of server/app.ts. The Express version stays as the
 * local dev server and as the thing the test suite pins the semantics to; this
 * one has to behave identically. The two that matter and are easy to get wrong:
 * expectedVersion is required and enforced, and the UPDATE repeats the version
 * check in its WHERE clause so two racing writers cannot both win.
 */
import type { Envelope } from "../shared/schema.ts";

type Env = { DB: D1Database; ASSETS: Fetcher };

const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const FORMAT = "handback-aes256gcm-v1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Same shape check as ENVELOPE_SCHEMA. Kept inline so the Worker pulls in no
 *  validator at the edge; the bounds are the ones the schema declares. */
function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== 3) return false; // no extra keys
  return (
    candidate.format === FORMAT &&
    typeof candidate.iv === "string" &&
    candidate.iv.length <= 64 &&
    typeof candidate.ciphertext === "string" &&
    candidate.ciphertext.length <= 4_000_000
  );
}

function newHandoffId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (url.pathname === "/api/h" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { envelope?: unknown } | null;
      if (!isEnvelope(body?.envelope)) return json({ error: "invalid_envelope" }, 400);

      const id = newHandoffId();
      const now = new Date().toISOString();
      const envelope = body!.envelope as Envelope;
      await env.DB.batch([
        env.DB.prepare("INSERT INTO handoffs (id, currentVersion, createdAt, updatedAt) VALUES (?, 1, ?, ?)")
          .bind(id, now, now),
        env.DB.prepare(
          "INSERT INTO envelopes (handoffId, version, format, iv, ciphertext, createdAt) VALUES (?, 1, ?, ?, ?, ?)",
        ).bind(id, envelope.format, envelope.iv, envelope.ciphertext, now),
      ]);
      return json({ id, version: 1 }, 201);
    }

    const versionsMatch = /^\/api\/h\/([^/]+)\/versions$/.exec(url.pathname);
    if (versionsMatch && request.method === "GET") {
      const id = decodeURIComponent(versionsMatch[1]!);
      if (!ID_PATTERN.test(id)) return json({ error: "invalid_id" }, 400);
      const rows = await env.DB.prepare(
        "SELECT version, createdAt FROM envelopes WHERE handoffId = ? ORDER BY version",
      ).bind(id).all<{ version: number; createdAt: string }>();
      if (!rows.results.length) return json({ error: "not_found" }, 404);
      return json({ id, versions: rows.results });
    }

    const match = /^\/api\/h\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      if (!ID_PATTERN.test(id)) return json({ error: "invalid_id" }, 400);

      if (request.method === "GET") {
        const handoff = await env.DB.prepare("SELECT id, currentVersion FROM handoffs WHERE id = ?")
          .bind(id).first<{ id: string; currentVersion: number }>();
        if (!handoff) return json({ error: "not_found" }, 404);

        // ?version=N reads an earlier envelope. Nothing is ever deleted, so an
        // approval that turns out to be wrong can still be recovered from.
        const raw = url.searchParams.get("version");
        const requested = raw === null ? handoff.currentVersion : Number(raw);
        if (!Number.isInteger(requested) || requested < 1) return json({ error: "invalid_version" }, 400);

        const row = await env.DB.prepare(
          "SELECT format, iv, ciphertext FROM envelopes WHERE handoffId = ? AND version = ?",
        ).bind(id, requested).first<{ format: string; iv: string; ciphertext: string }>();
        if (!row) return json({ error: "version_not_found", currentVersion: handoff.currentVersion }, 404);
        return json({
          id, version: requested, currentVersion: handoff.currentVersion,
          envelope: { format: row.format, iv: row.iv, ciphertext: row.ciphertext },
        });
      }

      if (request.method === "PUT") {
        const body = await request.json().catch(() => null) as
          { envelope?: unknown; expectedVersion?: unknown } | null;
        if (!isEnvelope(body?.envelope)) return json({ error: "invalid_envelope" }, 400);

        const expectedVersion = body?.expectedVersion;
        if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 1) {
          return json({ error: "expected_version_required" }, 400);
        }

        const handoff = await env.DB.prepare("SELECT currentVersion FROM handoffs WHERE id = ?")
          .bind(id).first<{ currentVersion: number }>();
        if (!handoff) return json({ error: "not_found" }, 404);
        if (handoff.currentVersion !== expectedVersion) {
          return json({ error: "version_conflict", currentVersion: handoff.currentVersion, expectedVersion }, 409);
        }

        const nextVersion = handoff.currentVersion + 1;
        const now = new Date().toISOString();
        const envelope = body!.envelope as Envelope;

        // Insert the envelope FIRST. The (handoffId, version) primary key is the
        // real concurrency guard: two writers racing for the same next version
        // cannot both land, whichever order their SELECTs happened to run in.
        try {
          await env.DB.prepare(
            "INSERT INTO envelopes (handoffId, version, format, iv, ciphertext, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
          ).bind(id, nextVersion, envelope.format, envelope.iv, envelope.ciphertext, now).run();
        } catch {
          return json({ error: "version_conflict", currentVersion: nextVersion }, 409);
        }

        await env.DB.prepare(
          "UPDATE handoffs SET currentVersion = ?, updatedAt = ? WHERE id = ? AND currentVersion = ?",
        ).bind(nextVersion, now, id, expectedVersion).run();

        return json({ id, version: nextVersion });
      }
    }

    return json({ error: "not_found" }, 404);
  },
};

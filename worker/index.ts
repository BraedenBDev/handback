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
      await env.DB.prepare(
        "INSERT INTO handoffs (id, version, envelope, createdAt, updatedAt) VALUES (?, 1, ?, ?, ?)",
      ).bind(id, JSON.stringify(body!.envelope), now, now).run();
      return json({ id, version: 1 }, 201);
    }

    const match = /^\/api\/h\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      if (!ID_PATTERN.test(id)) return json({ error: "invalid_id" }, 400);

      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT id, version, envelope FROM handoffs WHERE id = ?")
          .bind(id).first<{ id: string; version: number; envelope: string }>();
        if (!row) return json({ error: "not_found" }, 404);
        return json({ id: row.id, version: row.version, envelope: JSON.parse(row.envelope) });
      }

      if (request.method === "PUT") {
        const body = await request.json().catch(() => null) as
          { envelope?: unknown; expectedVersion?: unknown } | null;
        if (!isEnvelope(body?.envelope)) return json({ error: "invalid_envelope" }, 400);

        const expectedVersion = body?.expectedVersion;
        if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 1) {
          return json({ error: "expected_version_required" }, 400);
        }

        const row = await env.DB.prepare("SELECT version FROM handoffs WHERE id = ?")
          .bind(id).first<{ version: number }>();
        if (!row) return json({ error: "not_found" }, 404);
        if (row.version !== expectedVersion) {
          return json({ error: "version_conflict", currentVersion: row.version, expectedVersion }, 409);
        }

        const nextVersion = row.version + 1;
        const result = await env.DB.prepare(
          "UPDATE handoffs SET version = ?, envelope = ?, updatedAt = ? WHERE id = ? AND version = ?",
        ).bind(nextVersion, JSON.stringify(body!.envelope), new Date().toISOString(), id, expectedVersion).run();

        if (!result.meta.changes) return json({ error: "version_conflict" }, 409);
        return json({ id, version: nextVersion });
      }
    }

    return json({ error: "not_found" }, 404);
  },
};

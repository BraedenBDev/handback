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
import { DEFAULT_RETENTION_DAYS, expiryFrom, hasExpired, isValidRetention } from "../shared/expiry.ts";

type Env = { DB: D1Database; ASSETS: Fetcher };

const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const FORMAT = "handback-aes256gcm-v1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * WebMCP is disabled outright in a document whose agent cluster is not
 * origin-keyed — Chrome: "If a document has document.domain enabled (for
 * example, by using the Origin-Agent-Cluster: ?0 HTTP header), WebMCP APIs are
 * disabled", and registerTool rejects with SecurityError per the spec. Asking
 * for origin-keying explicitly means a future proxy or platform default cannot
 * quietly switch the tools off.
 */
function withAgentHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Origin-Agent-Cluster", "?1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

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

async function deleteHandoff(env: Env, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM envelopes WHERE handoffId = ?").bind(id),
    env.DB.prepare("DELETE FROM handoffs WHERE id = ?").bind(id),
  ]);
}

function newHandoffId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default {
  /**
   * Lazy deletion only removes a handoff when somebody asks for it. This sweep
   * catches the ones nobody comes back to, so "expires in 7 days" means the
   * ciphertext is gone rather than merely unserved.
   */
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const now = new Date().toISOString();
    const stale = await env.DB.prepare(
      "SELECT id FROM handoffs WHERE expiresAt IS NOT NULL AND expiresAt <= ?",
    ).bind(now).all<{ id: string }>();
    for (const { id } of stale.results) await deleteHandoff(env, id);
    if (stale.results.length) console.log(`swept ${stale.results.length} expired handoff(s)`);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // One canonical origin. WebMCP is origin-scoped and every handoff link is
    // minted with whatever origin created it, so serving apex and www as two
    // live origins would quietly produce two incompatible sets of links.
    // The fragment key is never sent to the server, and browsers carry it
    // across a redirect themselves, so #k=... survives this hop untouched.
    if (!url.pathname.startsWith("/api/")) return withAgentHeaders(await env.ASSETS.fetch(request));

    if (url.pathname === "/api/h" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { envelope?: unknown; retentionDays?: unknown } | null;
      if (!isEnvelope(body?.envelope)) return json({ error: "invalid_envelope" }, 400);

      const retentionDays = body?.retentionDays === undefined ? DEFAULT_RETENTION_DAYS : body.retentionDays;
      if (!isValidRetention(retentionDays)) return json({ error: "invalid_retention" }, 400);

      const id = newHandoffId();
      const now = new Date().toISOString();
      const expiresAt = expiryFrom(retentionDays as number | null, now);
      const envelope = body!.envelope as Envelope;
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO handoffs (id, currentVersion, createdAt, updatedAt, retentionDays, expiresAt) VALUES (?, 1, ?, ?, ?, ?)",
        ).bind(id, now, now, retentionDays as number | null, expiresAt),
        env.DB.prepare(
          "INSERT INTO envelopes (handoffId, version, format, iv, ciphertext, createdAt) VALUES (?, 1, ?, ?, ?, ?)",
        ).bind(id, envelope.format, envelope.iv, envelope.ciphertext, now),
      ]);
      return json({ id, version: 1, expiresAt }, 201);
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
        const handoff = await env.DB.prepare(
          "SELECT id, currentVersion, expiresAt FROM handoffs WHERE id = ?",
        ).bind(id).first<{ id: string; currentVersion: number; expiresAt: string | null }>();
        if (!handoff) return json({ error: "not_found" }, 404);

        // Expired handoffs are deleted on the way past rather than left to a
        // sweep, so the ciphertext goes at the first moment anyone asks.
        if (hasExpired(handoff.expiresAt)) {
          await deleteHandoff(env, id);
          return json({ error: "expired", expiredAt: handoff.expiresAt }, 410);
        }

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
          expiresAt: handoff.expiresAt,
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

        const handoff = await env.DB.prepare(
          "SELECT currentVersion, retentionDays, expiresAt FROM handoffs WHERE id = ?",
        ).bind(id).first<{ currentVersion: number; retentionDays: number | null; expiresAt: string | null }>();
        if (!handoff) return json({ error: "not_found" }, 404);
        if (hasExpired(handoff.expiresAt)) {
          await deleteHandoff(env, id);
          return json({ error: "expired", expiredAt: handoff.expiresAt }, 410);
        }
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

        // The window slides from this write, so a handoff being worked on does
        // not expire under whoever is working on it.
        const renewed = expiryFrom(handoff.retentionDays, now);
        await env.DB.prepare(
          "UPDATE handoffs SET currentVersion = ?, updatedAt = ?, expiresAt = ? WHERE id = ? AND currentVersion = ?",
        ).bind(nextVersion, now, renewed, id, expectedVersion).run();

        return json({ id, version: nextVersion, expiresAt: renewed });
      }
    }

    return json({ error: "not_found" }, 404);
  },
};

import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { encryptDocument, generateKey } from "../../src/crypto.ts";
import { stampDocument } from "../../src/hash.ts";

/**
 * "The server never sees plaintext" is only worth anything if it is checked
 * against what the database actually holds. An earlier version of this test
 * asserted that a response body looked encrypted, which proves nothing about
 * storage. This one reads every column of every row.
 */
describe("persistence holds ciphertext only", () => {
  it("writes no plaintext sentinel into any column of any table", async () => {
    const SENTINEL = "ELEPHANT-RHUBARB-CANTILEVER-99137";
    const doc = await stampDocument({
      state: {
        objective: `Objective containing ${SENTINEL}`,
        summary: `Summary also containing ${SENTINEL}`,
        handoffNote: SENTINEL,
      },
      version: 1,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
      parentHash: null,
      history: [],
    });

    const envelope = await encryptDocument(await generateKey(), doc);
    const created = await SELF.fetch("https://handback.link/api/h", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({ envelope }),
    });
    expect(created.status).toBe(201);

    // Every row of every table, serialised whole. Nothing selective, so a new
    // column added later cannot quietly escape this check.
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' AND name NOT LIKE 'd1_%'",
    ).all<{ name: string }>();
    expect(tables.results.length).toBeGreaterThan(0);

    let scanned = 0;
    for (const { name } of tables.results) {
      const rows = await env.DB.prepare(`SELECT * FROM ${name}`).all();
      const serialised = JSON.stringify(rows.results);
      scanned += serialised.length;
      expect(serialised, `plaintext leaked into table ${name}`).not.toContain(SENTINEL);
      expect(serialised, `base64 plaintext leaked into table ${name}`).not.toContain(btoa(SENTINEL));
      expect(serialised).not.toContain("Objective containing");
    }
    // Guard against the check passing because it scanned nothing at all.
    expect(scanned).toBeGreaterThan(100);
  });

  it("stores only the envelope fields, and no derived metadata", async () => {
    const envelope = { format: "handback-aes256gcm-v1", iv: "AAAAAAAAAAAAAAAA", ciphertext: "ZmFrZQ" };
    await SELF.fetch("https://handback.link/api/h", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({ envelope }),
    });

    const columns = await env.DB.prepare("SELECT name FROM pragma_table_info('envelopes')").all<{ name: string }>();
    // A title, summary or search column here would mean the server holds
    // something derived from the plaintext.
    expect(columns.results.map((c: { name: string }) => c.name).sort()).toEqual(
      ["ciphertext", "createdAt", "format", "handoffId", "iv", "version"],
    );
  });
});

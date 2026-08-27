import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../server/app.ts";
import { encryptDocument, generateKey } from "../src/crypto.ts";
import type { HandoffDocument } from "../shared/schema.ts";

/**
 * The claim "the server never sees plaintext" is only worth anything if it is
 * tested against the bytes actually on disk. The first implementation asserted
 * that a response body looked encrypted, which proves nothing about storage.
 */
describe("persistence holds ciphertext only", () => {
  it("never writes a known plaintext sentinel into the database file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "handback-cipher-"));
    const databasePath = join(directory, "test.sqlite");

    try {
      const SENTINEL = "ELEPHANT-RHUBARB-CANTILEVER-99137";
      const doc: HandoffDocument = {
        state: {
          objective: `Objective containing ${SENTINEL}`,
          summary: `Summary also containing ${SENTINEL}`,
          handoffNote: SENTINEL,
        },
        version: 1,
        createdAt: "2026-08-27T00:00:00.000Z",
        updatedAt: "2026-08-27T00:00:00.000Z",
        history: [],
      };

      const app = createApp(databasePath);
      const envelope = await encryptDocument(await generateKey(), doc);
      const created = await request(app).post("/api/h").send({ envelope }).expect(201);
      expect(created.body.id).toBeTruthy();

      // Read the raw file, not the API. Check both plain UTF-8 and base64,
      // since a naive implementation might store a base64 of the plaintext.
      const rawBytes = readFileSync(databasePath);
      expect(rawBytes.includes(Buffer.from(SENTINEL, "utf8"))).toBe(false);
      expect(rawBytes.includes(Buffer.from(Buffer.from(SENTINEL, "utf8").toString("base64"), "utf8"))).toBe(false);
      expect(rawBytes.toString("latin1")).not.toContain("Objective containing");

      // Sanity check the sentinel would have been found had it been stored,
      // otherwise this test passes even if the search itself is broken.
      expect(Buffer.from(`x${SENTINEL}x`).includes(Buffer.from(SENTINEL, "utf8"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

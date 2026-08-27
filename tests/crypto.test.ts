import { describe, expect, it } from "vitest";
import {
  buildHandoffUrl,
  decryptDocument,
  encryptDocument,
  exportKey,
  generateKey,
  importKey,
  readKeyFromFragment,
} from "../src/crypto.ts";
import type { HandoffDocument } from "../shared/schema.ts";

const doc: HandoffDocument = {
  state: { objective: "Ship Handback", summary: "Spec settled, building the MVP." },
  version: 1,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
  history: [],
};

describe("envelope encryption", () => {
  it("round-trips a document", async () => {
    const key = await generateKey();
    const restored = await decryptDocument(key, await encryptDocument(key, doc));
    expect(restored).toEqual(doc);
  });

  it("refuses to decrypt with the wrong key", async () => {
    const envelope = await encryptDocument(await generateKey(), doc);
    await expect(decryptDocument(await generateKey(), envelope)).rejects.toThrow();
  });

  it("uses a fresh IV per write so the same document never encrypts identically", async () => {
    const key = await generateKey();
    const first = await encryptDocument(key, doc);
    const second = await encryptDocument(key, doc);
    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it("keeps the original link working after a later version is written", async () => {
    // The regression that sank the first implementation: approving a
    // contribution minted a new key, so the link already handed out went dead.
    const key = await generateKey();
    const encoded = await exportKey(key);
    const url = buildHandoffUrl("https://handback.link", "abcdefghijklmnop", encoded);

    const v2: HandoffDocument = { ...doc, version: 2, summary: undefined } as HandoffDocument;
    const envelopeV2 = await encryptDocument(key, v2);

    const keyFromOriginalLink = await importKey(readKeyFromFragment(new URL(url).hash)!);
    await expect(decryptDocument(keyFromOriginalLink, envelopeV2)).resolves.toMatchObject({ version: 2 });
  });

  it("rejects a key that is not 256 bits", async () => {
    await expect(importKey("c2hvcnQ")).rejects.toThrow(/256 bits/);
  });
});

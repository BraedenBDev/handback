import { describe, expect, it } from "vitest";
import { canonicalize, computeContentHash, sealOf, stampDocument, verifyDocument } from "../src/hash.ts";
import { applyContribution } from "../src/contribution.ts";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";

const state: HandoffState = { objective: "Ship it", summary: "In progress." };

describe("canonicalization", () => {
  it("is stable across key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("sorts nested keys too", () => {
    expect(canonicalize({ x: { z: 1, y: 2 } })).toBe('{"x":{"y":2,"z":1}}');
  });

  it("preserves array order, because order is content", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("drops undefined so an absent key and an undefined key hash alike", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });

  it("distinguishes a number from its string form", () => {
    expect(canonicalize({ v: 1 })).not.toBe(canonicalize({ v: "1" }));
  });
});

describe("content hashing", () => {
  it("is deterministic", async () => {
    expect(await computeContentHash(state, 1, null)).toBe(await computeContentHash(state, 1, null));
  });

  it("changes when the content changes", async () => {
    const a = await computeContentHash(state, 1, null);
    const b = await computeContentHash({ ...state, summary: "Done." }, 1, null);
    expect(a).not.toBe(b);
  });

  it("binds the version, so the same state at another version hashes differently", async () => {
    expect(await computeContentHash(state, 1, null)).not.toBe(await computeContentHash(state, 2, null));
  });

  it("binds the parent, so a version cannot be replayed onto another chain", async () => {
    expect(await computeContentHash(state, 2, "aaaa")).not.toBe(await computeContentHash(state, 2, "bbbb"));
  });

  it("produces a 64-character hex digest", async () => {
    expect(await computeContentHash(state, 1, null)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("seals", () => {
  it("verifies a freshly stamped document", async () => {
    const doc = await stampDocument({ state, version: 1, createdAt: "t", updatedAt: "t", parentHash: null, history: [] });
    await expect(verifyDocument(doc)).resolves.toBe("verified");
  });

  it("detects content edited outside the approval path", async () => {
    const doc = await stampDocument({ state, version: 1, createdAt: "t", updatedAt: "t", parentHash: null, history: [] });
    const tampered: HandoffDocument = { ...doc, state: { ...doc.state, objective: "Something else entirely" } };
    await expect(verifyDocument(tampered)).resolves.toBe("mismatch");
  });

  it("detects a version number swapped underneath a valid state", async () => {
    const doc = await stampDocument({ state, version: 1, createdAt: "t", updatedAt: "t", parentHash: null, history: [] });
    await expect(verifyDocument({ ...doc, version: 7 })).resolves.toBe("mismatch");
  });

  it("reports documents from before sealing existed as unsealed, not broken", async () => {
    const legacy = { state, version: 1, createdAt: "t", updatedAt: "t", history: [] } as HandoffDocument;
    await expect(verifyDocument(legacy)).resolves.toBe("unsealed");
  });

  it("chains parent to child across an approved contribution", async () => {
    const v1 = await stampDocument({ state, version: 1, createdAt: "t", updatedAt: "t", parentHash: null, history: [] });
    const v2 = await stampDocument(
      applyContribution(v1, { baseVersion: 1, note: "n", operations: [{ op: "add_task", value: "Next" }] }),
    );
    expect(v2.parentHash).toBe(v1.contentHash);
    expect(v2.contentHash).not.toBe(v1.contentHash);
    await expect(verifyDocument(v2)).resolves.toBe("verified");
  });

  it("renders a short seal, and a placeholder when there is none", () => {
    expect(sealOf("abcdef0123456789")).toBe("abcdef01");
    expect(sealOf(undefined)).toHaveLength(8);
  });
});

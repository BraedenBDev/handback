import { describe, expect, it } from "vitest";
import { ImportError, readPortableFile } from "../src/import.ts";
import { toPortableJson } from "../src/export.ts";
import { stampDocument } from "../src/hash.ts";
import type { HandoffDocument } from "../shared/schema.ts";

async function exportedDoc(overrides: Partial<HandoffDocument> = {}) {
  const doc = await stampDocument({
    state: { objective: "Ship it", summary: "Nearly there.", tasks: [{ title: "Test", status: "todo" }] },
    version: 3,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    parentHash: null,
    history: [{ version: 2, note: "n", operations: [], approvedAt: "t" }],
  });
  return toPortableJson({ ...doc, ...overrides });
}

describe("importing a portable file", () => {
  it("reads back a file this app exported", async () => {
    const result = await readPortableFile(await exportedDoc());
    expect(result.state.objective).toBe("Ship it");
    expect(result.originalVersion).toBe(3);
    expect(result.historyLength).toBe(1);
    expect(result.seal).toBe("verified");
  });

  it("reports a broken seal instead of refusing the file", async () => {
    // Someone edited the JSON by hand. It is still their work; they need telling.
    const text = await exportedDoc();
    const tampered = JSON.parse(text);
    tampered.state.objective = "Something the seal never covered";
    const result = await readPortableFile(JSON.stringify(tampered));
    expect(result.seal).toBe("mismatch");
    expect(result.state.objective).toBe("Something the seal never covered");
  });

  it("treats a pre-seal export as unsealed rather than mismatched", async () => {
    const parsed = JSON.parse(await exportedDoc());
    delete parsed.contentHash;
    const result = await readPortableFile(JSON.stringify(parsed));
    expect(result.seal).toBe("unsealed");
  });

  it("rejects text that is not JSON", async () => {
    await expect(readPortableFile("not json at all")).rejects.toThrow(ImportError);
  });

  it("rejects JSON that is not a Handback export", async () => {
    await expect(readPortableFile(JSON.stringify({ hello: "world" }))).rejects.toThrow(/not a Handback export/);
  });

  it("rejects a file whose format tag is from another tool", async () => {
    const parsed = JSON.parse(await exportedDoc());
    parsed.format = "some-other-tool-v1";
    await expect(readPortableFile(JSON.stringify(parsed))).rejects.toThrow(/not a Handback export/);
  });

  it("rejects a file whose state fails the schema", async () => {
    const parsed = JSON.parse(await exportedDoc());
    delete parsed.state.summary;
    await expect(readPortableFile(JSON.stringify(parsed))).rejects.toThrow(/not valid/);
  });

  it("rejects extra properties smuggled into the state", async () => {
    const parsed = JSON.parse(await exportedDoc());
    parsed.state.payload = "<script>alert(1)</script>";
    await expect(readPortableFile(JSON.stringify(parsed))).rejects.toThrow(/not valid/);
  });

  it("does not pollute Object.prototype from a hostile file", async () => {
    const hostile = '{"format":"handback-portable-v1","state":{"objective":"a","summary":"b","__proto__":{"pwned":1}}}';
    await expect(readPortableFile(hostile)).rejects.toThrow();
    expect(({} as any).pwned).toBeUndefined();
  });

  it("survives an empty history and a missing version", async () => {
    const parsed = JSON.parse(await exportedDoc());
    delete parsed.history;
    delete parsed.version;
    const result = await readPortableFile(JSON.stringify(parsed));
    expect(result.historyLength).toBe(0);
    expect(result.originalVersion).toBe(1);
  });
});

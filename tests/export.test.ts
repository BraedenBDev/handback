import { describe, expect, it } from "vitest";
import { toMarkdown, toPortableJson } from "../src/export.ts";
import { stampDocument } from "../src/hash.ts";
import type { HandoffDocument } from "../shared/schema.ts";

const doc: HandoffDocument = {
  state: {
    objective: "Pick a gestoría",
    summary: "Two candidates left.",
    decisions: [{ decision: "Split the engagement", rationale: "Cheaper" }],
    constraints: [{ kind: "must_not", text: "No invoice caps" }],
    tasks: [{ title: "Get quotes", status: "todo" }, { title: "Verify pricing", status: "done" }],
    openQuestions: ["One-off or annual?"],
    sources: [{ title: "Billeo", url: "https://billeo.es" }],
    handoffNote: "Confirm the Dubai party first.",
  },
  version: 2,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
  contentHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  parentHash: null,
  history: [{ version: 2, note: "Added a quote", operations: [], approvedAt: "2026-08-27T01:00:00.000Z" }],
};

describe("markdown export", () => {
  const md = toMarkdown(doc);

  it("leads with the objective as the title", () => {
    expect(md.startsWith("# Pick a gestoría")).toBe(true);
  });

  it("carries the version and the seal", () => {
    expect(md).toContain("version 2");
    expect(md).not.toContain("\u2014"); // design-taste bans em-dashes in generated prose
    expect(md).toContain("abcdef01");
  });

  it("includes every populated section", () => {
    for (const heading of ["## Where this stands", "## Decisions", "## Constraints", "## Tasks", "## Open questions", "## Sources", "## History"]) {
      expect(md).toContain(heading);
    }
  });

  it("marks done tasks as checked and open ones as unchecked", () => {
    expect(md).toContain("- [x] Verify pricing");
    expect(md).toContain("- [ ] Get quotes");
  });

  it("omits sections that are empty rather than printing empty headings", () => {
    const bare = toMarkdown({ ...doc, state: { objective: "o", summary: "s" }, history: [] });
    expect(bare).not.toContain("## Decisions");
    expect(bare).not.toContain("## History");
  });

  it("does not lose content to markdown when text contains markup characters", () => {
    const hostile = toMarkdown({
      ...doc,
      state: { ...doc.state, objective: "Costs <b>50%</b> more [see](http://evil)" },
    });
    expect(hostile).toContain("Costs <b>50%</b> more [see](http://evil)");
  });
});

describe("portable export", () => {
  it("is valid JSON tagged with its format", () => {
    const parsed = JSON.parse(toPortableJson(doc));
    expect(parsed.format).toBe("handback-portable-v1");
    expect(parsed.exportedAt).toBeTruthy();
  });

  it("carries the full state, version, seal and history", () => {
    const parsed = JSON.parse(toPortableJson(doc));
    expect(parsed.state).toEqual(doc.state);
    expect(parsed.version).toBe(2);
    expect(parsed.contentHash).toBe(doc.contentHash);
    expect(parsed.history).toHaveLength(1);
  });

  it("round-trips a stamped document without breaking its seal", async () => {
    const stamped = await stampDocument({
      state: doc.state, version: 1, createdAt: "t", updatedAt: "t", parentHash: null, history: [],
    });
    const parsed = JSON.parse(toPortableJson(stamped));
    expect(parsed.contentHash).toBe(stamped.contentHash);
    expect(parsed.state).toEqual(stamped.state);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ErrorNote, HistoryView, Seal, StateView, ToolStatus } from "../src/ui.tsx";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";

afterEach(cleanup);

const state: HandoffState = {
  objective: "Pick a gestoría",
  summary: "Two candidates left.",
  decisions: [{ decision: "Split the engagement", rationale: "Cheaper overall" }],
  constraints: [{ kind: "must_not", text: "No invoice caps" }],
  tasks: [{ title: "Get quotes", status: "todo" }, { title: "Verify pricing", status: "done" }],
  openQuestions: ["One-off or annual?"],
  sources: [{ title: "Billeo", url: "https://billeo.es" }],
  handoffNote: "Confirm the Dubai party first.",
};

describe("StateView", () => {
  it("renders every populated section", () => {
    render(<StateView state={state} />);
    for (const text of [
      "Pick a gestoría", "Two candidates left.", "Split the engagement", "Cheaper overall",
      "No invoice caps", "Get quotes", "One-off or annual?", "Billeo", "Confirm the Dubai party first.",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("omits sections with no content rather than rendering empty labels", () => {
    render(<StateView state={{ objective: "o", summary: "s" }} />);
    expect(screen.queryByText("Decisions")).toBeNull();
    expect(screen.queryByText("Sources")).toBeNull();
  });

  it("opens source links with noopener and noreferrer", () => {
    // The fragment key must never leak through a Referer header.
    render(<StateView state={state} />);
    const link = screen.getByRole("link", { name: "Billeo" });
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("shows task status alongside each task", () => {
    render(<StateView state={state} />);
    const done = screen.getByText("Verify pricing").closest("li")!;
    expect(within(done).getByText("done")).toBeTruthy();
  });
});

describe("agent-supplied content is rendered as text, never as markup", () => {
  // A handoff carries text written by other people's agents. If any of this
  // reached the DOM as HTML, the whole trust model would be theatre.
  const hostile: HandoffState = {
    objective: '<img src=x onerror="globalThis.__pwned = true">',
    summary: "<script>globalThis.__pwned = true</script>",
    decisions: [{ decision: "<iframe src='javascript:alert(1)'></iframe>", rationale: "<b>bold?</b>" }],
    openQuestions: ["<svg onload='globalThis.__pwned = true'></svg>"],
    handoffNote: "</div><h1>escaped?</h1>",
  };

  it("does not execute or inject anything", () => {
    const { container } = render(<StateView state={hostile} />);
    expect((globalThis as any).__pwned).toBeUndefined();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the markup to the human as literal text", () => {
    render(<StateView state={hostile} />);
    expect(screen.getByText('<img src=x onerror="globalThis.__pwned = true">')).toBeTruthy();
    expect(screen.getByText("<b>bold?</b>")).toBeTruthy();
    expect(screen.getByText("</div><h1>escaped?</h1>")).toBeTruthy();
  });

  it("keeps a hostile constraint kind inside the tag, not the document", () => {
    render(<StateView state={{ objective: "o", summary: "s", constraints: [{ kind: "<b>must</b>", text: "t" }] }} />);
    expect(screen.getByText("<b>must</b>")).toBeTruthy();
  });
});

describe("Seal", () => {
  it("shows the short hash and version", () => {
    render(<Seal version={3} hash="abcdef0123456789" />);
    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText("abcdef01")).toBeTruthy();
  });

  it("announces a mismatch to assistive technology, not just by colour", () => {
    render(<Seal version={1} hash="abcdef0123456789" verdict="mismatch" />);
    expect(screen.getByText(/seal does not match/)).toBeTruthy();
  });

  it("distinguishes unsealed from mismatched", () => {
    render(<Seal version={1} hash={null} verdict="unsealed" />);
    expect(screen.getByText(/unsealed/)).toBeTruthy();
  });
});

describe("status and errors", () => {
  it("tells the user how to enable WebMCP when it is missing", () => {
    render(<ToolStatus available={false} />);
    expect(screen.getByText(/WebMCP not detected/)).toBeTruthy();
    expect(screen.getByText(/enable-webmcp-testing/)).toBeTruthy();
  });

  it("confirms registration when WebMCP is present", () => {
    render(<ToolStatus available={true} />);
    expect(screen.getByText(/WebMCP tools registered/)).toBeTruthy();
  });

  it("announces errors with role=alert so they are read out", () => {
    render(<ErrorNote error="That key does not decrypt this handoff." />);
    expect(screen.getByRole("alert").textContent).toContain("does not decrypt");
  });

  it("renders nothing when there is no error", () => {
    const { container } = render(<ErrorNote error={null} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("HistoryView", () => {
  const doc = {
    state, version: 3, createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T02:00:00.000Z",
    history: [
      { version: 2, note: "Added the UAE finding", operations: [], approvedAt: "2026-08-27T01:00:00.000Z" },
      { version: 3, note: "Priced the study", operations: [], approvedAt: "2026-08-27T02:00:00.000Z" },
    ],
  } as HandoffDocument;

  it("lists every approved contribution in order", () => {
    render(<HistoryView doc={doc} />);
    expect(screen.getByText("Added the UAE finding")).toBeTruthy();
    expect(screen.getByText("Priced the study")).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
  });

  it("renders nothing for a handoff that has never been contributed to", () => {
    const { container } = render(<HistoryView doc={{ ...doc, history: [] }} />);
    expect(container.innerHTML).toBe("");
  });
});

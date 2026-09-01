import { describe, expect, it } from "vitest";
import { applyContribution, describeContribution, describeOperationProblems, StaleBaseError } from "../src/contribution.ts";
import type { HandoffDocument } from "../shared/schema.ts";

const base: HandoffDocument = {
  state: {
    objective: "Ship Handback",
    summary: "Spec settled.",
    tasks: [{ title: "Write the spec", status: "done" }, { title: "Build the MVP", status: "todo" }],
  },
  version: 1,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
  history: [],
};

describe("applying a contribution", () => {
  it("adds a decision and bumps the version", () => {
    const next = applyContribution(base, {
      baseVersion: 1,
      note: "Recording the stack choice",
      operations: [{ op: "add_decision", value: "Use node:sqlite", rationale: "No native dependency" }],
    });
    expect(next.version).toBe(2);
    expect(next.state.decisions).toEqual([{ decision: "Use node:sqlite", rationale: "No native dependency" }]);
    expect(next.history.at(-1)?.note).toBe("Recording the stack choice");
  });

  it("refuses a contribution written against a stale base version", () => {
    expect(() =>
      applyContribution(base, { baseVersion: 99, note: "late", operations: [{ op: "add_task", value: "x" }] }),
    ).toThrow(StaleBaseError);
  });

  it("changes a task status by title", () => {
    const next = applyContribution(base, {
      baseVersion: 1,
      note: "Progress",
      operations: [{ op: "set_task_status", value: "Build the MVP", status: "in_progress" }],
    });
    expect(next.state.tasks?.find((task) => task.title === "Build the MVP")?.status).toBe("in_progress");
  });

  it("throws rather than inventing a task the reviewer never saw", () => {
    expect(() =>
      applyContribution(base, {
        baseVersion: 1,
        note: "Typo in title",
        operations: [{ op: "set_task_status", value: "Bild the MVP", status: "done" }],
      }),
    ).toThrow(/No task titled/);
  });

  it("rejects an unknown operation instead of silently skipping it", () => {
    expect(() =>
      applyContribution(base, { baseVersion: 1, note: "sneaky", operations: [{ op: "delete_constraint", value: "x" }] }),
    ).toThrow(/Unknown contribution operation/);
  });

  it("never mutates the document it was given", () => {
    const snapshot = structuredClone(base);
    applyContribution(base, { baseVersion: 1, note: "n", operations: [{ op: "add_task", value: "New" }] });
    expect(base).toEqual(snapshot);
  });

  it("describes every operation for the human reviewer", () => {
    const lines = describeContribution({
      baseVersion: 1,
      note: "n",
      operations: [
        { op: "add_decision", value: "D" },
        { op: "set_task_status", value: "T", status: "done" },
      ],
    });
    expect(lines).toEqual(["Add decision: D", 'Mark task "T" as done']);
  });
});

describe("op-specific fields the input schema cannot require", () => {
  it("refuses set_task_status with no status instead of assuming done", () => {
    // This was `operation.status ?? "done"`. The one operation whose entire
    // purpose is to set a status guessed it when missing, and guessed the most
    // consequential value in the enum — and under auto-approval, which is the
    // default, no human ever saw the guess.
    const problems = describeOperationProblems([
      { op: "set_task_status", value: "Ship the thing" } as any,
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/set_task_status/);
    expect(problems[0]).toMatch(/todo, in_progress, blocked or done/);
  });

  it("refuses add_source with no url", () => {
    const problems = describeOperationProblems([{ op: "add_source", value: "A paper" } as any]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/needs a url/);
  });

  it("names every bad operation by index, not just the first", () => {
    const problems = describeOperationProblems([
      { op: "add_decision", value: "fine" } as any,
      { op: "set_task_status", value: "no status" } as any,
      { op: "add_source", value: "no url" } as any,
    ]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("operations[1]");
    expect(problems[1]).toContain("operations[2]");
  });

  it("passes operations that carry what they need", () => {
    expect(describeOperationProblems([
      { op: "set_task_status", value: "Ship the thing", status: "blocked" } as any,
      { op: "add_source", value: "A paper", url: "https://example.com" } as any,
      { op: "add_task", value: "New task" } as any, // status is genuinely optional here
    ])).toEqual([]);
  });

  it("still applies a status that was supplied, and never invents one", () => {
    const applied = applyContribution(base, {
      baseVersion: base.version,
      note: "Blocked on legal",
      operations: [{ op: "set_task_status", value: "Build the MVP", status: "blocked" }],
    });
    expect(applied.state.tasks!.find((t) => t.title === "Build the MVP")!.status).toBe("blocked");

    // The backstop, for anything reaching apply without going through the tool.
    expect(() => applyContribution(base, {
      baseVersion: base.version,
      note: "No status given",
      operations: [{ op: "set_task_status", value: "Build the MVP" } as any],
    })).toThrow(/needs a status/);
  });
});

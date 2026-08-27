import { describe, expect, it } from "vitest";
import { applyContribution, describeContribution, StaleBaseError } from "../src/contribution.ts";
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

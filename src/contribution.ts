/**
 * Applying an approved contribution. Pure function, no I/O, so the rules are
 * testable without a browser or a server.
 *
 * Contributions are additive or status-changing by design. There is no delete
 * operation: a receiving agent should not be able to remove a constraint or a
 * decision the owner put there, even with approval, because the reviewer is
 * far more likely to notice added text than quietly removed text.
 */
import type { Contribution, ContributionOp, HandoffDocument, Task } from "../shared/schema.ts";

export class StaleBaseError extends Error {
  constructor(baseVersion: number, currentVersion: number) {
    super(`Contribution was written against version ${baseVersion}, but this handoff is at version ${currentVersion}.`);
    this.name = "StaleBaseError";
  }
}

export function applyContribution(
  doc: HandoffDocument,
  contribution: Contribution,
  now = new Date().toISOString(),
): HandoffDocument {
  if (contribution.baseVersion !== doc.version) {
    throw new StaleBaseError(contribution.baseVersion, doc.version);
  }

  const state = structuredClone(doc.state);

  for (const operation of contribution.operations) {
    switch (operation.op) {
      case "set_summary":
        state.summary = operation.value;
        break;
      case "add_decision":
        (state.decisions ??= []).push({
          decision: operation.value,
          rationale: operation.rationale ?? "",
        });
        break;
      case "add_task":
        (state.tasks ??= []).push({
          title: operation.value,
          status: operation.status ?? "todo",
        });
        break;
      case "set_task_status": {
        const task = (state.tasks ??= []).find((candidate) => candidate.title === operation.value);
        // An unmatched title is a real mismatch, not something to paper over by
        // inventing a task the reviewer never saw in the diff.
        if (!task) throw new Error(`No task titled "${operation.value}" to update.`);
        // No default. `?? "done"` used to sit here, which meant the one
        // operation whose entire purpose is to set a status guessed it when it
        // was missing, and guessed the most consequential value in the enum.
        // Under auto-approval no human ever saw the guess. Callers are refused
        // up front by describeOperationProblems; this is the backstop.
        if (!operation.status) throw new Error(`set_task_status needs a status for "${operation.value}".`);
        task.status = operation.status as Task["status"];
        break;
      }
      case "add_source":
        (state.sources ??= []).push({
          title: operation.value,
          url: operation.url ?? "",  // refused before it gets here; see below
        });
        break;
      case "add_open_question":
        (state.openQuestions ??= []).push(operation.value);
        break;
      default:
        throw new Error(`Unknown contribution operation: ${operation.op}`);
    }
  }

  // parentHash links this version to the one it descends from. contentHash is
  // left for stampDocument() to compute, because hashing is async and keeping
  // this function synchronous keeps the rules testable without a crypto stub.
  return {
    state,
    version: doc.version + 1,
    createdAt: doc.createdAt,
    updatedAt: now,
    parentHash: doc.contentHash ?? null,
    history: [
      ...doc.history,
      {
        version: doc.version + 1,
        note: contribution.note,
        operations: contribution.operations,
        approvedAt: now,
      },
    ],
  };
}

/** Human-readable diff lines for the approval screen. */
export function describeContribution(contribution: Contribution): string[] {
  return contribution.operations.map((operation) => {
    switch (operation.op) {
      case "set_summary":
        return `Replace the summary with: ${operation.value}`;
      case "add_decision":
        return `Add decision: ${operation.value}`;
      case "add_task":
        return `Add task (${operation.status ?? "todo"}): ${operation.value}`;
      case "set_task_status":
        return `Mark task "${operation.value}" as ${operation.status ?? "done"}`;
      case "add_source":
        return `Add source: ${operation.value}${operation.url ? ` (${operation.url})` : ""}`;
      case "add_open_question":
        return `Add open question: ${operation.value}`;
      default:
        return `Unknown operation: ${operation.op}`;
    }
  });
}


/**
 * Op-specific field requirements, checked before anything is staged.
 *
 * `op` and `value` are the only fields JSON Schema can mark required here,
 * because which of the rest apply depends on `op` — and expressing that needs
 * if/then, which validate.ts deliberately does not implement. A WebMCP grader
 * flagged the gap on 2026-09-01 and it was a real one: an agent could send
 * set_task_status with no status and get a silent "done".
 *
 * Returns one line per problem, empty when every operation can be applied.
 * Callers turn this into a refusal VALUE, so a wrong call costs the agent one
 * more round trip rather than a thrown error it cannot read.
 */
export function describeOperationProblems(operations: ContributionOp[]): string[] {
  const problems: string[] = [];
  operations.forEach((operation, index) => {
    const at = `operations[${index}] (${operation.op})`;
    if (operation.op === "set_task_status" && !operation.status) {
      problems.push(`${at} needs a status of todo, in_progress, blocked or done. Nothing is assumed: say which.`);
    }
    if (operation.op === "add_source" && !operation.url) {
      problems.push(`${at} needs a url. A source without one cannot be followed.`);
    }
  });
  return problems;
}

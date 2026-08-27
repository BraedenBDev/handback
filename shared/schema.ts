/**
 * Single source of truth for Handback's structured state.
 *
 * These JSON Schema literals are used verbatim in three places:
 *   1. WebMCP `inputSchema` (what the agent is told it may send)
 *   2. Client-side validation before anything is staged into the UI
 *   3. Server-side validation of the envelope shape
 *
 * Keeping one literal avoids the drift where a tool advertises a shape the
 * app does not actually enforce. Every object sets additionalProperties:false
 * so an agent cannot smuggle unexpected keys past the preview.
 */

// Bounded everywhere: agent-supplied text is untrusted and must not be able to
// exhaust storage or hide a wall of prompt-injection text below the fold.
const shortText = (description: string, maxLength = 500) =>
  ({ type: "string", maxLength, description }) as const;

export const DECISION_SCHEMA = {
  type: "object",
  properties: {
    decision: shortText("What was decided.", 300),
    rationale: shortText("Why it was decided, in one or two sentences.", 800),
  },
  required: ["decision", "rationale"],
  additionalProperties: false,
} as const;

export const CONSTRAINT_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["must", "must_not", "budget", "deadline", "legal", "technical"],
      description: "Constraint category.",
    },
    text: shortText("The constraint as the next agent must honour it.", 400),
  },
  required: ["kind", "text"],
  additionalProperties: false,
} as const;

export const TASK_SCHEMA = {
  type: "object",
  properties: {
    title: shortText("Task title.", 300),
    status: {
      type: "string",
      enum: ["todo", "in_progress", "blocked", "done"],
      description: "Current task status.",
    },
  },
  required: ["title", "status"],
  additionalProperties: false,
} as const;

export const SOURCE_SCHEMA = {
  type: "object",
  properties: {
    title: shortText("Source title.", 300),
    url: { type: "string", maxLength: 2000, description: "Source URL." },
  },
  required: ["title", "url"],
  additionalProperties: false,
} as const;

/** The full plaintext object. Never leaves the browser unencrypted. */
export const HANDOFF_STATE_SCHEMA = {
  type: "object",
  properties: {
    objective: shortText("The single outcome the work is aiming at.", 600),
    summary: shortText("Where the work actually stands right now.", 4000),
    decisions: {
      type: "array",
      maxItems: 50,
      items: DECISION_SCHEMA,
      description: "Decisions already made, with rationale.",
    },
    constraints: {
      type: "array",
      maxItems: 50,
      items: CONSTRAINT_SCHEMA,
      description: "Rules the next agent must not violate.",
    },
    openQuestions: {
      type: "array",
      maxItems: 50,
      items: shortText("An unresolved question.", 500),
      description: "What is still undecided.",
    },
    tasks: {
      type: "array",
      maxItems: 100,
      items: TASK_SCHEMA,
      description: "Work items and their status.",
    },
    sources: {
      type: "array",
      maxItems: 100,
      items: SOURCE_SCHEMA,
      description: "Evidence the conclusions rest on.",
    },
    handoffNote: shortText("A direct note to whoever picks this up next.", 2000),
  },
  required: ["objective", "summary"],
  additionalProperties: false,
} as const;

/**
 * A contribution is a set of explicit operations against a known base version,
 * never a whole replacement object. Whole-object replacement would let a
 * receiving agent silently drop sections the owner never reviewed.
 */
export const CONTRIBUTION_OP_SCHEMA = {
  type: "object",
  properties: {
    op: {
      type: "string",
      enum: ["set_summary", "add_decision", "add_task", "set_task_status", "add_source", "add_open_question"],
      description: "Which change to make.",
    },
    value: {
      type: "string",
      maxLength: 4000,
      description: "The new text. For set_task_status use the task title.",
    },
    rationale: shortText("Why this change. Shown to the human reviewer.", 800),
    status: {
      type: "string",
      enum: ["todo", "in_progress", "blocked", "done"],
      description: "Only for set_task_status and add_task.",
    },
    url: { type: "string", maxLength: 2000, description: "Only for add_source." },
  },
  required: ["op", "value"],
  additionalProperties: false,
} as const;

export const CONTRIBUTION_SCHEMA = {
  type: "object",
  properties: {
    baseVersion: {
      type: "integer",
      minimum: 1,
      description: "Version this proposal was written against. Stale bases are refused.",
    },
    note: shortText("What this contribution adds, for the human reviewer.", 1000),
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: CONTRIBUTION_OP_SCHEMA,
      description: "The proposed changes.",
    },
  },
  required: ["baseVersion", "note", "operations"],
  additionalProperties: false,
} as const;

/** Sections a reading agent may request. Read is deliberately selective. */
export const READ_SECTIONS = [
  "objective",
  "summary",
  "decisions",
  "constraints",
  "openQuestions",
  "tasks",
  "sources",
  "handoffNote",
] as const;

export type ReadSection = (typeof READ_SECTIONS)[number];

export type Decision = { decision: string; rationale: string };
export type Constraint = { kind: string; text: string };
export type Task = { title: string; status: "todo" | "in_progress" | "blocked" | "done" };
export type Source = { title: string; url: string };

export type HandoffState = {
  objective: string;
  summary: string;
  decisions?: Decision[];
  constraints?: Constraint[];
  openQuestions?: string[];
  tasks?: Task[];
  sources?: Source[];
  handoffNote?: string;
};

export type ContributionOp = {
  op: string;
  value: string;
  rationale?: string;
  status?: Task["status"];
  url?: string;
};

export type Contribution = {
  baseVersion: number;
  note: string;
  operations: ContributionOp[];
};

/** What actually gets encrypted and stored, including lineage. */
export type HandoffDocument = {
  state: HandoffState;
  version: number;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    version: number;
    note: string;
    operations: ContributionOp[];
    approvedAt: string;
  }>;
};

/** The only shape the server ever sees. No titles, no summaries, no metadata. */
export type Envelope = {
  format: "handback-aes256gcm-v1";
  iv: string; // base64url
  ciphertext: string; // base64url
};

export const ENVELOPE_SCHEMA = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["handback-aes256gcm-v1"] },
    iv: { type: "string", maxLength: 64 },
    ciphertext: { type: "string", maxLength: 4_000_000 },
  },
  required: ["format", "iv", "ciphertext"],
  additionalProperties: false,
} as const;

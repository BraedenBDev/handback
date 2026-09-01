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
      // REQUIRED for set_task_status. JSON Schema could express that with
      // if/then, but validate.ts implements a deliberate subset and throws on
      // keywords it does not handle, so the requirement is stated here and
      // enforced in describeOperationProblems() rather than half-declared.
      description: "Required for set_task_status. Optional for add_task, where it defaults to todo. Ignored by every other op.",
    },
    url: {
      type: "string",
      maxLength: 2000,
      description: "Required for add_source. Ignored by every other op.",
    },
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
  /** SHA-256 of this version's state bound to its version and parent. */
  contentHash?: string;
  /** The contentHash of the version this descends from. null at version 1. */
  parentHash?: string | null;
  history: Array<{
    version: number;
    note: string;
    operations: ContributionOp[];
    approvedAt: string;
    contentHash?: string;
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


/* --------------------------------------------------------------------------
   Result schemas.
 
   A third-party WebMCP grader marked every tool down on 2026-09-01 for the
   same thing: an agent has to infer the return shape from prose. It was right
   about the problem. It is worth knowing where the fix does and does not land.
 
   `ModelContextTool` in the WebMCP IDL is `{ name, title, description,
   inputSchema, execute, annotations }` and has no outputSchema member, and
   WebIDL dictionaries drop members they do not declare. So a spec-compliant
   host silently discards these. They are declared anyway because three things
   do read them: the fallback registry in webmcp.ts, which is what a browser
   without WebMCP talks to; MCP bridges that convert a page's tools into real
   MCP tools, where outputSchema is a first-class field paired with the
   structuredContent this file's results already carry; and scanners reading
   the descriptor directly. When the dictionary gains the member, this is
   already correct.
   -------------------------------------------------------------------------- */

/** Shared by every tool: a refusal is a value, never a throw. */
const REFUSAL_FIELDS = {
  status: { type: "string", enum: ["refused"], description: "The call was understood and declined." },
  reason: {
    type: "string",
    enum: ["human_only", "wrong_page", "wrong_tool", "stale_base", "not_ready", "invalid_retention", "invalid_input", "invalid_operation"],
    description: "Machine-readable cause. Branch on this, not on the message.",
  },
  message: { type: "string", description: "What to do instead, in one sentence." },
} as const;

export const STAGE_HANDOFF_RESULT_SCHEMA = {
  type: "object",
  properties: {
    ...REFUSAL_FIELDS,
    status: {
      type: "string",
      enum: ["created", "staged_awaiting_human_approval", "refused"],
      description: "created means the link exists now. staged means a human must click Approve and create.",
    },
    url: { type: "string", description: "The full handoff link, including the #k= key fragment. Reply with it verbatim." },
    version: { type: "integer", minimum: 1, description: "Version of the handoff just written." },
  },
  required: ["status"],
} as const;

export const RECEIPT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["created", "pending", "none"],
      description: "created: a link exists. pending: a draft awaits a human click. none: this page holds no handoff.",
    },
    url: { type: "string", description: "Present only when status is created." },
    version: { type: "integer", minimum: 1, description: "Present only when status is created." },
    message: { type: "string", description: "Present when status is none, saying what to call instead." },
  },
  required: ["status"],
} as const;

export const READ_HANDOFF_RESULT_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "integer", minimum: 1, description: "Version these sections were read from. Pass it back as baseVersion." },
    error: { type: "string", description: "Present instead of content when no handoff is open on this page." },
    offset: { type: "integer", minimum: 0, description: "Where this slice of a paged section started." },
    nextOffset: { type: "integer", minimum: 0, description: "Pass as offset to continue. Absent when complete." },
    totalLength: { type: "integer", minimum: 0, description: "Full character length of a paged section." },
    complete: { type: "boolean", description: "False when more of this section remains." },
    truncated: { type: "boolean", description: "True when whole sections were dropped to fit the budget." },
    droppedSections: { type: "array", items: { type: "string" }, description: "Sections to ask for one at a time." },
    note: { type: "string", description: "How to fetch the rest." },
  },
  // Requested sections appear as their own keys, so this cannot be closed.
  additionalProperties: true,
} as const;

export const STAGE_CONTRIBUTION_RESULT_SCHEMA = {
  type: "object",
  properties: {
    ...REFUSAL_FIELDS,
    status: {
      type: "string",
      enum: ["committed", "staged_awaiting_human_approval", "refused"],
      description: "committed means a new sealed version exists. staged means a human must click Approve contribution.",
    },
    version: { type: "integer", minimum: 1, description: "The new version, when committed." },
    baseVersion: { type: "integer", minimum: 1, description: "The version this proposal was written against." },
    operationCount: { type: "integer", minimum: 0, description: "How many operations are awaiting review." },
    currentVersion: { type: "integer", minimum: 1, description: "On a stale_base refusal: re-read at this version and propose again." },
    problems: { type: "array", items: { type: "string" }, description: "On invalid_operation: one line per operation that cannot be applied." },
  },
  required: ["status"],
} as const;

export const SETTINGS_RESULT_SCHEMA = {
  type: "object",
  properties: {
    ...REFUSAL_FIELDS,
    status: { type: "string", enum: ["ok", "refused"], description: "ok means the settings below are the live values." },
    settings: {
      type: "object",
      properties: {
        requireApproval: { type: "boolean", description: "True when every write waits for a human click." },
        retentionDays: { type: ["integer", "null"], minimum: 1, description: "Days until deletion, or null for never." },
      },
      required: ["requireApproval", "retentionDays"],
      description: "The live settings after this call.",
    },
  },
  required: ["status"],
} as const;

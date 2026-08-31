# Handback — WebMCP MVP

> **Historical.** This is a pre-build MVP spec, kept for its reasoning and its
> WebMCP research. It describes the product as scoped, not as shipped. Two
> deliberate changes since: auto-approval is on by default, so the write tools
> create rather than stage unless a device turns the gate on; and a fifth tool,
> `handback_settings`, was added. README.md and SECURITY.md describe the shipped
> behaviour.

## Product interaction

The user opens the Handback creation page in a WebMCP-capable browser and tells the current agent:

> “Hand this work off.”

The agent discovers the page tools and submits explicit structured state from its current conversational context. The page visibly renders the proposed handoff. The user approves it. The browser encrypts the object and uploads only ciphertext. The tool resolves with one private capability link, which the agent gives to the user.

This matches WebMCP’s intended model: tools belong to the live page, use the page’s existing application logic and session, and let the person and agent work against the same visible state.[2][5]

## Crucial boundary

WebMCP does not install Handback globally into every agent. The tools belong to the page that registered them; closing or navigating away can make them unavailable.[5]

Therefore the honest MVP instruction is:

1. Ask the agent to open the Handback creation URL.
2. Say “hand this work off.”
3. The agent calls the page tool with the state already in its context.
4. The page and user complete the handoff together.

A later MCP/A2A adapter can provide an always-available integration. That is outside the hackathon-critical path.

## Smallest useful tool surface

### Creation page

#### `stage_handoff`

Purpose: let the agent submit a proposed structured handoff to the visible page.

Side effects: updates only the on-page draft; does not upload or commit anything.

Input:

```json
{
  "objective": "string",
  "summary": "string",
  "decisions": [{"text": "string", "rationale": "string"}],
  "constraints": [{"text": "string", "kind": "requirement|preference|prohibition"}],
  "open_questions": ["string"],
  "tasks": [{"text": "string", "status": "done|active|blocked|next"}],
  "sources": [{"title": "string", "url": "string"}],
  "handoff_note": "string"
}
```

Output:

```json
{
  "status": "awaiting_human_approval",
  "draft_id": "local-random-id",
  "message": "The proposed handoff is visible on the page for review."
}
```

Annotations:

```js
{ readOnlyHint: false, untrustedContentHint: true }
```

The untrusted-content annotation matters because the proposed state may contain external text, retrieved pages, or prior-agent output. WebMCP tool definitions and results are not inherently trustworthy, and Chrome recommends labeling externally sourced or user-generated content accordingly.[4][5]

#### `get_handoff_receipt`

Purpose: after the person clicks **Approve and create**, return the result to the agent.

Input: `{ "draft_id": "string" }`

Outputs one of:

```json
{"status":"awaiting_human_approval"}
```

or:

```json
{
  "status": "created",
  "handoff_url": "https://service.example/h/<random-id>#<secret>",
  "version": 1,
  "portable_export_available": true
}
```

Annotations:

```js
{ readOnlyHint: true, untrustedContentHint: false }
```

### Handoff page

#### `read_handoff`

Purpose: return the currently decrypted structured state to the visiting agent.

Input:

```json
{
  "sections": ["manifest", "summary", "decisions", "constraints", "open_questions", "tasks", "sources", "artifacts", "history"]
}
```

Output: only the requested sections plus object/version identifiers.

Annotations:

```js
{ readOnlyHint: true, untrustedContentHint: true }
```

Every handoff is untrusted agent context. The receiving agent must treat it as data rather than instructions that override the user.

#### `stage_contribution`

Purpose: let a receiving agent propose a structured delta.

Input:

```json
{
  "base_version": 1,
  "summary": "string",
  "operations": [
    {
      "op": "add|replace|resolve|complete",
      "section": "decisions|constraints|open_questions|tasks|sources",
      "target_id": "optional-string",
      "value": {}
    }
  ]
}
```

Output:

```json
{
  "status": "awaiting_human_approval",
  "proposal_id": "local-random-id",
  "diff_visible": true
}
```

Annotations:

```js
{ readOnlyHint: false, untrustedContentHint: true }
```

There is deliberately no agent-callable `approve_contribution` tool in the MVP. Approval remains a human UI action, preventing the same agent from proposing and self-approving a canonical change.

After the human approves, the visible page updates to the committed version and hash. The MVP deliberately did not add a fifth receipt tool (a fifth tool, `handback_settings`, was later added for a different purpose); the receiving agent can call `read_handoff` again to verify the new canonical version.

## Registration shape

The current imperative API registers tools through `document.modelContext.registerTool({ name, title, description, inputSchema, execute, annotations })`. It is available only in secure contexts; tool names are constrained, schemas are JSON Schema objects, and execution returns a serializable JavaScript value.[1]

```js
if (typeof document.modelContext?.registerTool === "function") {
  await document.modelContext.registerTool({
    name: "stage_handoff",
    title: "Prepare a handoff",
    description:
      "Prepare a structured handoff from the current work. This only stages a visible draft; the person must review and approve before anything is stored.",
    inputSchema: handoffSchema,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    execute: async (input) => {
      const draft = validateAndStageVisibleDraft(input);
      return {
        status: "awaiting_human_approval",
        draft_id: draft.id,
        message: "The handoff draft is visible for review.",
      };
    },
  });
}
```

Use an `AbortController` for registration lifecycle and unregister tools when the page state no longer supports them. Keep schemas narrow, describe side effects, reuse existing authorization/validation, and return evidence that lets the person and agent verify the result.[3][5]

## Human approval flow

1. Agent calls `stage_handoff`.
2. Page renders a structured preview and warnings.
3. User edits, removes sensitive sections, or cancels.
4. User clicks **Approve and create**.
5. Browser creates random ID/key/nonce, encrypts locally, uploads ciphertext, and stores the private link in page state.
6. Agent calls `get_handoff_receipt` and receives the link.

This separates agent proposal from consequential commitment while still making WebMCP central rather than decorative.

## Encryption and link handling

- Generate the object ID and AES-GCM key with `crypto.getRandomValues`.
- Encrypt in the browser using Web Crypto.
- Put the key in the fragment, never path or query.
- Upload ciphertext, algorithm/version metadata, nonce, and minimum routing metadata only.
- Provide a portable encrypted file and readable Markdown export.
- Disclose that the hosted JavaScript must still be trusted at execution time.

## Three-minute demo

**0:00–0:20 — Problem**

Show a useful agent session with decisions, sources, and unfinished tasks. Explain that copying the transcript loses state and ownership.

**0:20–1:00 — WebMCP creation**

Open Handback and say: “Hand this work off.” Show the agent discover `stage_handoff`, populate the page, and the page visibly render the structured draft. Remove one sensitive item and approve. Agent returns the private link.

**1:00–1:40 — Walk away and resume**

Close the original session. Open the link in a separate agent/browser context. Ask: “What am I taking over?” The agent calls `read_handoff` and accurately reports the objective, constraints, decisions, and next task.

**1:40–2:20 — Contribute and approve**

Ask the second agent to add one material finding and complete one task. It calls `stage_contribution`. Show the diff, approve it, and obtain version 2.

**2:20–2:45 — Return and verify**

Open the same object with the first or third agent. It identifies the new contribution and continues without transcript archaeology.

**2:45–3:00 — Ownership**

Download the portable file. End on: “The agent can disappear. The provider can disappear. You still have the work.”

## Hackathon fit

The rules require a live, consistently working web app, public open-source repository with a visible license and actual `document.modelContext.registerTool(...)` code, an explanation of why WebMCP improves the experience, and a public YouTube demonstration under three minutes.[6]

The judging criteria are equally weighted across WebMCP leverage, execution, impact, and creativity. The round-trip demo should therefore show multiple genuine tool calls, a coherent human-facing product, a specific portability problem, and an interaction that differs visibly from ordinary chat export.[6]

## Explicit exclusions from MVP

- Real-time multi-user editing
- Accounts and organizations
- Semantic search across every handoff
- Provider-specific transcript importers
- Full artifact chunking or large-file streaming
- Formal A2A/MCP server
- Public protocol standardization campaign
- Social profiles or agent identity network

## Verification checklist

- Tools appear in ChatGPT’s in-app browser and Chrome 149+ with the testing flag.
- Unsupported browsers retain a complete human UI.
- Creation and contribution are visibly staged before commit.
- Read tools have `readOnlyHint: true`.
- Tools returning handoff/external content have `untrustedContentHint: true`.
- Schemas reject unknown properties and oversized fields.
- Tool output accurately reports whether the object is staged or committed.
- Navigating away cancels pending work safely.
- The server never receives plaintext or fragment key.
- A fresh client can import the portable file.

## Sources

[1] https://webmachinelearning.github.io/webmcp — WebMCP Draft Specification
[2] https://developer.chrome.com/docs/ai/webmcp — Chrome WebMCP documentation
[3] https://developer.chrome.com/docs/ai/webmcp/imperative-api — Chrome WebMCP Imperative API
[4] https://developer.chrome.com/docs/ai/webmcp/secure-tools — Chrome WebMCP tool security
[5] https://learn.chatgpt.com/docs/webmcp — OpenAI Site tools / WebMCP
[6] https://webmcp.devpost.com/rules — WebMCP Challenge official rules

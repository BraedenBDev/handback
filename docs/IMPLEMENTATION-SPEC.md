# Handback MVP — Implementation Spec

## Settled product decision

**Brand:** Handback  
**Tagline:** Hand off the work. Get it back intact.

The MVP is a human-visible WebMCP web app that turns useful agent work into one client-side-encrypted handoff link, lets a second agent read the structured state, and lets that agent stage a contribution which only a human can approve.

## Non-negotiable boundaries

- WebMCP tools are page-local and document-lifetime scoped.
- WebMCP provides neither storage, encryption, authentication, nor consent.
- Tool annotations are model hints, not authorization controls.
- No agent-callable approval or commit tool exists.
- The backend never receives plaintext or the URL-fragment key.
- Every consequential operation is staged visibly and committed by an ordinary human button click.
- Unsupported browsers retain a complete manual UI.

## MVP tool surface

1. `stage_handoff`: populate a visible local creation draft only.
2. `get_handoff_receipt`: report pending status or the created link after human approval.
3. `read_handoff`: return selected sections of the currently decrypted handoff.
4. `stage_contribution`: populate a visible structured delta against an explicit base version only.

No `approve_*`, `commit_*`, or delete/revoke tool is exposed to an agent.

## Core demo path

1. Agent opens `/` and calls `stage_handoff`.
2. Human reviews/edits the structured draft and clicks **Approve and create**.
3. Browser generates an AES-256-GCM key, encrypts the JSON locally, uploads ciphertext, and produces `/h/<opaque-id>#<base64url-key>`.
4. A separate browser/agent opens the link. The browser fetches ciphertext and decrypts locally.
5. Agent calls `read_handoff` to recover selected structured sections.
6. Agent calls `stage_contribution` with `base_version` and structured operations.
7. Human reviews the visible diff and clicks **Approve contribution**.
8. Browser applies validated operations, creates version 2, encrypts locally, and sends ciphertext with optimistic version checking.
9. The handoff page shows version history and allows encrypted portable JSON plus readable Markdown export.

## Data model

Structured state includes: objective, summary, decisions with rationale, constraints with kind, open questions, tasks with status, sources, handoff note, version, parent hash, content hash, timestamp, and contribution history.

The server record includes only: opaque object ID, current version, ciphertext envelope(s), and timestamps. Ciphertext envelopes include format version, AES-GCM IV, and ciphertext. Titles and summaries are never server metadata.

## Implementation choice

- TypeScript monorepo
- React + Vite client
- Express API
- SQLite ciphertext store
- Web Crypto in the browser
- Zod/runtime validation at both UI and API boundaries
- Vitest unit/API tests
- Playwright browser smoke test when browser binaries are available

This stack keeps the security boundary inspectable and produces a real local working artifact without committing to a hosting provider before the demo is proven.

## Acceptance gates

- Production build succeeds.
- Tests cover encryption round-trip, wrong-key failure, schema rejection, contribution application, optimistic version conflict, and ciphertext-only persistence.
- Browser smoke test creates, reopens, decrypts, contributes, approves, and exports.
- Source contains exactly the four agent-callable WebMCP tools above.
- No plaintext from a known fixture appears in the SQLite database.
- Human approval controls are normal page buttons and are not callable through WebMCP.

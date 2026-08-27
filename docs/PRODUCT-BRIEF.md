# Handback — Product Brief

## Product promise

**Ask your agent to hand off. Get one private link. Walk away with the work.**

Handback is a neutral handoff layer between a person and whichever AI agent they are using. The person should not need to copy a transcript, understand schemas, install an extension, create an account, or stay inside the original AI provider.

The core interaction is conversational:

> “Hand this off to Handback.”

The agent uses the Handback WebMCP tool surface to package the useful state, not merely the raw conversation. Handback returns one private capability link. That link is the user’s durable handle to the work. It can be reopened in a browser, downloaded as a portable encrypted file, or handed to another person or compatible agent.

## Irreducible user outcome

At the end of a productive AI session, the user can leave with:

1. A private link they control.
2. A human-readable view of the objective, state, decisions, constraints, tasks, sources, and artifacts.
3. A portable local file independent of Agent USB and the original AI provider.
4. A way for another person and their agent to continue and propose changes.
5. A verifiable record of what changed and who approved it.

If the original AI chat, provider account, or Handback service disappears, the downloaded object remains usable.

## First user story

1. Braeden works with an agent on a research or delivery task.
2. He says, “Hand this off to Handback.”
3. The agent opens Handback, discovers its page-local WebMCP tools, and calls `stage_handoff` with structured state.
4. Handback shows the exact package and asks Braeden to approve creation.
5. It encrypts the object client-side and returns a link whose secret remains in the URL fragment.
6. Braeden can close everything and retain only that link.
7. Later he opens it with another agent, or sends it to a collaborator.
8. The collaborator’s agent reads the state and proposes a contribution.
9. The collaborator approves the contribution.
10. Braeden reopens the same object and sees the proposed or committed delta, provenance, and next state.
11. Either person can export the current version as a portable file and readable Markdown.

## Product modes

### 1. Handoff link
Default mass-market mode. No account required. Ciphertext stored remotely; key remains client-side. The user receives a capability URL.

### 2. Portable file
A downloadable encrypted object containing the manifest, state, version lineage, and optionally embedded artifacts. This is the “USB” promise and the survival path if the service disappears.

### 3. Shared continuation
A link may allow read-only access or contribution proposals. Canonical changes require a human-visible approval event. Collaboration is asynchronous first; real-time editing is not required for MVP.

## Minimum structured state

- Objective
- Current state / executive summary
- Decisions and rationale
- Constraints and prohibitions
- Open questions
- Tasks by status
- Sources and citations
- Artifacts and hashes
- Handoff note for the next agent
- Contributions and provenance
- Version parent/hash/timestamp

Raw transcript is optional evidence, not the primary object.

## Trust model

- Browser-side authenticated encryption.
- Server stores ciphertext and minimum routing metadata only.
- Cryptographically random object IDs.
- Secret in URL fragment, never request path/query.
- Separate read, contribute, and owner/revocation capabilities where feasible.
- Agent-generated state is previewed before creation.
- Agent proposals are previewed before canonical commit.
- Export always available without proprietary lock-in.
- Security copy must disclose metadata leakage, bearer-link risk, and malicious-client-code risk honestly.

## WebMCP MVP tools

- `stage_handoff`
- `get_handoff_receipt`
- `read_handoff`
- `stage_contribution`

Creation and contribution approval remain ordinary visible human UI actions. They are deliberately not agent-callable tools. Export remains available in the human UI rather than expanding the WebMCP surface.

## MVP success test

The demo passes only if:

1. Agent A creates the handoff from an active session.
2. The user receives one link and closes Agent A.
3. A separate Agent B recovers structured state through WebMCP.
4. Agent B adds materially useful work.
5. A human approves the delta.
6. Agent A or Agent C reopens the same state and continues correctly.
7. The user downloads a portable file and can import it into a fresh local instance.

If replacing Handback with a Markdown attachment produces essentially the same demo, the product has failed its differentiation test.

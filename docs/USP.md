# Handback — USP and Competitive Edge

## USP

**Handback is the take-away object for AI work.**

It turns a provider-bound conversation into one user-controlled, private, portable state object that can be continued by another person or agent and returned with an auditable change history.

The USP is not encryption, chat export, memory, or agent messaging individually. It is the complete user interaction:

> **Ask your agent to hand off → receive one private link → walk away → continue anywhere → bring the updated work back.**

## Why this edge is defensible

### 1. The object is canonical state, not copied context

Existing switching tools inject a transcript or summary into a new chat. That produces another divergent copy. Handback preserves one named state object with versions and contributions.

### 2. It is user-owned rather than provider-owned memory

Memory systems optimize what an assistant remembers. Handback optimizes what the person can take away, inspect, share selectively, and retain independently.

### 3. It supports round trips

Most handoff products stop once a receiving agent opens a new thread. Handback is designed for return: another person or agent contributes, a human approves, and the original user can continue from the updated state.

### 4. Human approval is part of the protocol

The agent does not silently rewrite canonical state. It proposes a delta; the human sees and approves it. This is both a trust advantage and a strong WebMCP demonstration.

### 5. The local artifact is first-class

The hosted link is convenient, but the downloaded object is the ownership guarantee. The service is transport and collaboration infrastructure, not the sole custodian.

### 6. Capability scopes reflect real collaboration

A bearer link need not imply full control. Reader, contributor, and owner/revocation capabilities can be separate, allowing people to share the minimum authority required.

### 7. It is deliberately thin and adapter-friendly

Handback should not replace A2A, MCP, AG-UI, WebMCP, OMP, or PAM. It defines the user-owned handoff artifact and maps to those protocols. Thinness improves adoption and reduces standards vanity.

## Competitive frame

| Category | Existing products solve | Agent USB difference |
|---|---|---|
| Chat exporters/switchers | Move transcript into another AI | Canonical structured state, return path, approvals, lineage |
| AI memory platforms | Persist facts/preferences across sessions | User-controlled task object, selective sharing, portable file |
| Agent handoff protocols | Move objective/context/resources between apps | Encrypted artifact owned by user, no bilateral integration required for browser path |
| Encrypted paste/file links | Private content transport | Machine-readable task semantics and agent collaboration |
| Encrypted workspaces | Private documents and collaboration | Minimal portable object purpose-built for agent continuation |
| Agent message rooms | Agent-to-agent communication | Durable state, artifacts, provenance, and human control |

## Wedge market

Start with AI power users who:

- switch between ChatGPT, Claude, Gemini, local agents, and coding agents;
- collaborate with someone who uses a different AI;
- need to preserve research, decisions, and artifacts outside one provider;
- care about privacy or organizational boundaries;
- already understand the pain of rebuilding context.

The viral unit is the handoff link: one user creates it; another person and agent consume it.

## Product moat if it works

The early moat is not cryptography. It is:

1. A trusted and well-documented open handoff format.
2. Excellent extraction of useful state from messy conversations.
3. Reliable adapters across WebMCP, MCP, and A2A.
4. A clear human approval and diff experience.
5. Portability that users can independently verify.
6. Network effects from links that introduce the receiver to Agent USB.
7. Compatibility tests showing that independent agents preserve state correctly.

## Positioning language

### Recommended

- “Ask your agent to hand off.”
- “Take your AI work with you.”
- “One private link. Continue anywhere.”
- “A portable shared state object for people and agents.”
- “Share the work, not the transcript.”

### Avoid

- “Universal AI memory”
- “The first cross-agent handoff protocol”
- “The first encrypted AI archive”
- “A better chat exporter”
- “Dropbox for AI chats”
- Claims that URL-fragment keys or AES-GCM are novel
- Claims that Agent USB can transfer a model’s hidden state

## Kill criteria

Stop or radically narrow the project if:

- The handoff cannot be created conversationally by an ordinary compatible agent.
- The receiver needs a browser extension, account, or manual JSON workflow for the core demo.
- The portable file cannot be opened without the hosted service.
- Collaboration becomes ordinary document editing with an AI sidebar.
- The state extractor loses critical constraints or invents decisions.
- The round trip cannot identify and reconcile changes.
- The demo remains equivalent to sharing Markdown.

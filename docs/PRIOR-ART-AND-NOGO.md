# Agent USB — Prior Art, Findings, and No-Gos

## Research conclusion

No reviewed product combines all of the following:

- user-owned encrypted artifact;
- canonical structured task state;
- round-trip collaboration across separate people and agents;
- human approval gates;
- capability-scoped access;
- cryptographic version lineage;
- native WebMCP discovery and tools;
- local portable-file survival mode.

The gap is real, but all underlying primitives have prior art. Novelty must be described as product composition and interaction design.

## Closest prior art

### Agent Handoff Protocol
Moves an explicit user-approved objective, selected conversation, resources, thread ID, and idempotency key between agent applications and supports create/resume/round trips. Missing: user-owned encrypted artifact, local-file mode, WebMCP, general multi-party canonical state, and capability URLs.

Source: https://github.com/DeepJudge-Agent-Handoff-Protocol/agenthandoffprotocol

### ContextSwitchAI
Free, local browser extension supporting export, notes, search, attachments, and context injection across nine AI platforms. Missing: canonical state, collaborative return, permissions, provenance, approvals, hosted/private share link.

Source: https://contextswitchai.github.io/ContextSwitchAI

### Open Memory Protocol
Vendor-neutral memory objects and HTTP API, self-hosted server, SDKs, MCP adapters, browser capture, handoff, import/export, and PWA. Missing: standalone encrypted artifact, user-held capability model, human approval, and append-only collaborative state.

Source: https://github.com/SMJAI/open-memory-protocol

### Portable AI Memory
Interchange specification with normalized conversations, memory types, provenance, lifecycle, hashes, signatures, decentralized identity, and access control. Potential compatibility target. It is a format, not the consumer handoff product.

Source: https://github.com/portable-ai-memory/portable-ai-memory

### Portable Agent Memory
Research protocol with Merkle-DAG provenance, capability-scoped access, selective disclosure, cryptographic integrity, and injection-resistant rehydration. Strong security prior art.

Source: https://arxiv.org/html/2605.11032v1

### AIWebPad
Free expiring agent rendezvous with authenticated tickets, sequenced messages, human observation, code rotation, and round-trip coordination. Missing durable encrypted structured state and local ownership.

Source: https://aiwebpad.com/humans

### Relay Capsules
Coding-agent handoff package with goals, constraints, decisions, touched files, verification, open questions, next steps, reviews, and append-only events. The public name and capsule metaphor are already occupied.

Source: https://devpost.com/software/relay-capsules

## Adjacent products proving primitive commoditization

- PrivateBin: browser-side AES-GCM, ciphertext-only storage, fragment keys, expiry, burn-after-reading.
- CryptPad: encrypted collaborative Markdown/documents, permissions, history.
- Wormhole: encrypted ephemeral file links and P2P transfer.
- Tresorit Send: encrypted links, expiry, revocation, management capability.
- OnionShare: local authority, capability address, anonymous transfer/chat.
- Anytype: local-first encrypted structured knowledge and collaboration.
- Obsidian Sync / Standard Notes: encrypted portable personal knowledge.
- Mem0 / Letta / MemoryPlugin / AI Context Flow / Walrus Memory: persistent and portable AI-memory components.

## No-go product categories

Do not build:

1. A generic AI chat exporter.
2. A browser extension whose main function is copying context between providers.
3. A universal personal-memory database.
4. An encrypted pastebin with AI branding.
5. Another collaborative Markdown editor.
6. A general-purpose agent message room.
7. A full encrypted workspace competing with CryptPad or Anytype.
8. A new replacement for A2A, MCP, AG-UI, WebMCP, OMP, or PAM.
9. A model-hidden-state transfer product; explicit portable state is the honest boundary.
10. A product requiring recipients to understand JSON, schemas, or cryptography.

## Naming no-gos

- Relay Capsules: occupied directly in this category.
- Relay as the main unqualified product name: crowded and weakly ownable.
- Capsule as the only object metaphor: heavily used in portable-agent-state literature and products.

`agent.usb` / Agent USB is a promising interaction metaphor, but **`.usb` is not currently a delegated top-level domain in IANA's root or RDAP bootstrap**, so `www.agent.usb` is not a publicly registrable domain. Treat Agent USB as the product metaphor and find a conventional registrable domain separately. Do not present `agent.usb` as available or resolving.

## Security no-gos

- Do not say “zero knowledge” without disclosing metadata and served-JavaScript risk.
- Do not put secrets in URL paths or query strings.
- Do not use one unrestricted bearer capability for every action if scoped capabilities are feasible.
- Do not let agents commit canonical changes without human-visible approval.
- Do not treat encryption as protection from malicious content or prompt injection.
- Do not store plaintext server-side for indexing or convenience.
- Do not make hosted availability the only way to recover a handoff.

## Protocol posture

- WebMCP: browser-native tool exposure for the hackathon and consumer path.
- MCP: adapter for desktop and runtime agents.
- A2A/AHP: interoperability with agent applications and formal handoff flows.
- AG-UI: state snapshot/delta and human-interrupt patterns.
- PAM/PAM-like formats: compatibility target for memories, normalized conversations, provenance, and signatures.

Agent USB should define only the missing artifact, capabilities, and lifecycle.

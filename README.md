# Handback

**Hand off the work. Get it back intact.**

At the end of a productive session with an agent, the useful part — the objective, the decisions and why they were made, the constraints, what is still open — is trapped in one provider's chat history. Handback turns it into one private link you own. Another person's agent can read that link, propose additions, and hand it back, with a human approving every change.

**Live:** <https://handback.link>

Built for the [WebMCP Challenge](https://webmcp.devpost.com).

## What makes this a WebMCP product rather than a file export

If replacing Handback with "ask your agent for a Markdown file" produces the same result, it has failed. The difference is the round trip:

- The agent packages structured state directly from its live context — no copy-paste, no schema for the user to learn.
- A second agent reads that state back **as structured data it can act on**, not prose it has to re-derive.
- That second agent proposes changes against a specific version, and the change is shown to a human as a diff before it becomes real.
- Every version is encrypted with a key that never reaches the server.

## The agent-callable surface

Four tools, registered on the page via `document.modelContext.registerTool`:

| Tool | Does | Never does |
|---|---|---|
| `stage_handoff` | Fills the visible draft on screen | Save, encrypt, publish |
| `get_handoff_receipt` | Reports pending, or the link once approved | Create anything |
| `read_handoff` | Returns requested sections of the open handoff | Reveal the key |
| `stage_contribution` | Stages a proposed diff against a base version | Commit it |

**There is deliberately no `approve_*` or `commit_*` tool.** Creation and contribution approval are ordinary buttons a human clicks. That click is the entire consent boundary of the product, and an agent-callable approval would dissolve it. `readOnlyHint` and `untrustedContentHint` are hints to the agent, not enforcement — they are documentation here, not a security control.

## Deploying

Production runs on a Cloudflare Worker with D1. The Worker (`worker/index.ts`) is a
port of the Express app and must keep the same semantics; `scripts/smoke-live.ts`
is what holds it to that.

```bash
npm run build
npx wrangler deploy
node scripts/smoke-live.ts https://handback.link
```

The smoke script runs the whole lifecycle over the network: create, reopen from
the link alone, seal verification, contribute, the 409 lost-update guard,
retrieval and decryption of earlier versions, the original link still decrypting
at v2, and the canonical-host redirects. 19 checks.

`handback.link` is canonical. `www.handback.link` and the old
`handback.braeden-bihag.workers.dev` subdomain both stay reachable and 301 to it,
preserving path, query and (client-side) the fragment key. The workers.dev host
is kept alive on purpose: links minted there are real links, and a product whose
promise is that work survives should not break its own URLs to tidy a hostname.

Schema changes go in `migrations/` and are applied with
`npx wrangler d1 execute handback --remote --file=./migrations/<file>.sql`.
Migrations rename rather than drop, so they can be reversed.

## Running it

```bash
npm install
npm run build
npm start          # http://localhost:8787 — serves API and client together
```

For development with hot reload:

```bash
npm run dev        # client on :5173, API on :8787
npm run test:all   # 142 unit + 30 end-to-end
```

The suite is the audit. It includes axe against both themes with zero
violations, a contrast guard that parses `src/style.css` so tokens cannot drift
below 4.5:1, XSS-as-text assertions on agent-supplied content, hostile-input
coverage of `shared/validate.ts` (which sits on the trust boundary), and a
reduced-motion check that asserts zero animations rather than shorter ones.

### Browser setup

WebMCP needs Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled, or ChatGPT's in-app browser. Without it the page still works — every flow has a visible manual form, including contributions — it just cannot be driven by an agent.

**Verified against Chrome 149 on 2026-08-27.** All four tools register, and `stage_handoff` was driven end to end through the real API. Two details the current draft spec does not spell out, both found the hard way:

- `executeTool` takes the **`RegisteredTool` object** from `getTools()`, not a tool name. Passing a name throws `The provided value is not of type 'RegisteredTool'`.
- The input argument must be a **JSON string**, not an object. Passing an object throws `Failed to parse input arguments`. The result comes back as a JSON string too.

```js
const tools = await document.modelContext.getTools();
const tool = tools.find((t) => t.name === "stage_handoff");
const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify(payload)));
```

`ModelContext` exposes `registerTool`, `getTools`, `executeTool` and `ontoolchange`. Treat all of this as unstable — WebMCP is a Draft Community Group Report, not a standard.

## Design

The handoff's own words are set in a serif because they are prose a person wrote
and another must read. The machinery around them (labels, versions, keys, seals)
is mono because it is apparatus. You can tell at a glance which is which.

Amber is the accent because it means *awaiting you*. The human approval gate is
the product, so the product's colour is the colour of something that has stopped
and is waiting for a person.

Every version carries a **seal**: the first eight characters of a SHA-256 over
its state, bound to its version number and its parent's hash. A document edited
outside the approval path no longer matches its seal and the page says so. It is
not a signature and proves nothing about authorship, only internal consistency,
and the copy is careful not to imply more.

## Security posture, stated honestly

- **AES-256-GCM in the browser.** The key is generated at creation, lives in the URL fragment, and is reused for every later version. The fragment is never sent in an HTTP request.
- **The server stores an opaque id, a version number, and a ciphertext envelope.** No titles, no summaries, no search index. `tests/ciphertext-only.test.ts` proves this by writing a known sentinel string through the real flow and asserting its bytes are absent from the SQLite file.
- **Anyone holding the whole link can read the handoff.** It is a bearer capability, like a password in a URL. This is a deliberate trade for "no account required", not an oversight.
- **This is not zero-knowledge.** The server delivers the JavaScript that does the encrypting. A malicious or compromised server could serve code that exfiltrates the key. Hosting metadata — object size, timing, IP — is also visible.
- **Encryption is not protection from prompt injection.** A handoff carries text written by other people's agents. `read_handoff` marks it untrusted, the UI badges it, and nothing in it is ever treated as an instruction.
- **The seal is a consistency check, not a signature.** Anyone holding the key can recompute a valid one. It detects accidental or careless edits outside the approval path; it does not prove who made a change.
- **Contributions are additive.** There is no delete operation, because a reviewer is far likelier to notice added text than quietly removed text.

## Layout

```
shared/schema.ts     JSON Schema, one source of truth for WebMCP and validation
shared/validate.ts   The subset validator that walks it (replaced Ajv)
src/hash.ts          Content seals and the parent chain
src/crypto.ts        AES-256-GCM, one key per handoff, reused across versions
src/webmcp.ts        The four tool registrations
src/contribution.ts  Pure apply-a-contribution logic
server/app.ts        Express API, enforced optimistic concurrency
docs/                Product brief, spec, prior art, naming, WebMCP research
```

`docs/` carries the decisions this build rests on, including `PRIOR-ART-AND-NOGO.md` — what was researched, what was rejected, and why.

## Still to do

- A YouTube demo under three minutes with audio, for the submission.
- Automate the browser checks. All four tools were driven through `executeTool`
  by hand on 2026-08-27, on both localhost and the deployed origin, but nothing
  guards against a regression.
- An MCP adapter for agents that are not in a browser. Today a CLI agent has to be handed the fragment key and write its own decrypt, which is exactly the "recipient must understand cryptography" failure `docs/PRIOR-ART-AND-NOGO.md` rules out.

- Revocation and expiry.

## License

MIT

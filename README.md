# Handback

**Hand off the work. Get it back intact.**

At the end of a productive session with an agent, the useful part — the objective, the decisions and why they were made, the constraints, what is still open — is trapped in one provider's chat history. Handback turns it into one private link you own. Another person's agent can read that link, propose additions, and hand it back, with a human approving every change.

**Live:** <https://handback.link> · **Source:** <https://github.com/BraedenBDev/handback>

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

## Approval

By default your agent *stages* and you commit with a click. That click is the
consent boundary, and there is deliberately no agent-callable tool that can
perform it.

Per-device auto-approval relaxes the friction without removing the record. Flip
the switch once and this browser stops asking: `stage_handoff` creates
immediately and hands the agent the link, `stage_contribution` commits
immediately. Consent moves from per-action to per-device, which is the same
shape as an "always allow" permission.

It is safe to offer because storage is append-only. Every version's ciphertext is
kept, so anything committed without a click is still readable at the previous
version and recoverable. Auto-approval removes the prompt, not the history.

Off by default: a visitor who has never chosen gets the gate.

## Client compatibility

Established by reading the specifications and shipped implementations, not by
clicking through browsers. Each claim below is encoded as a test in
`tests/webmcp-compat.test.ts` so it cannot rot silently.

**The entry point has moved twice.** `window.agent` (to Oct 2025) became
`navigator.modelContext` (Feb 2026), then `document.modelContext` in
[PR #184](https://github.com/webmachinelearning/webmcp/pull/184) on 2026-05-27,
so that tools would be document-scoped rather than shared across a navigation.
`document` is canonical, but `navigator.modelContext` is still what the official
`@mcp-b/webmcp-polyfill` exposes as a deprecated alias, what Brave's shipped
integration reads, and — verified on the live site — what Chrome 149 itself
still exposes alongside `document`. Registration probes `document` first, then
`navigator`, and checks for a callable `registerTool` rather than mere presence.
`window.agent` is deliberately not probed: it never shipped in any browser.

**Thrown errors are discarded by design.** The spec runs `completionSteps` with
`(null, false)` and rejects with a bare `UnknownError`; making that granular is
still an open TODO in `index.bs`. Chrome flattens it further, to "Tool was
executed but the invocation failed". So no tool here throws. Every refusal is a
returned value carrying a reason the agent can act on.

**Output is paged, not truncated.** Chrome guides ~1.5K characters per tool
response, and the schema permits 100 sources and 50 decisions, so a full
`read_handoff` is roughly 366,000 characters worst case. An earlier version
simply dropped any section that would not fit — and `summary` may be 4,000
characters, so it could *never* fit. A real ChatGPT session hit exactly that,
gave up on the tool and scraped the rendered page instead. A reader that
silently cannot return a field is worse than no reader. An oversized single
section is now returned, cut to fit, with the exact offset to resume from;
asking for one section at a time is the paging mechanism.

**Constraints observed:** tool names within the spec's hard 1–128 character
limit and its `[A-Za-z0-9_.-]` charset (violations reject with
`InvalidStateError`); Chrome's 30 / 500 / 150 character guidance for names,
descriptions and parameter descriptions; and only the two annotations WebMCP
actually defines, `readOnlyHint` and `untrustedContentHint`. MCP core's
`destructiveHint`, `idempotentHint` and `openWorldHint` are not part of WebMCP's
`ToolAnnotations` and would be dropped.

**`Origin-Agent-Cluster: ?1` is sent on every page response.** WebMCP is
disabled outright in a document whose agent cluster is not origin-keyed.

**Return shape: MCP content blocks, normalised at the registration boundary.**
The spec accepts anything JSON-serialisable (`execute` is `Promise<any>`, and the
platform stringifies it), and Chrome's own demos return bare objects. But those
demos are single pages that know their client. Every wrapper written for *reuse*
across unknown clients converges on content blocks — Google's own
`use-webmcp-tool`, `@mcp-b/webmcp-polyfill`'s normalizer, MCPCat's hook and
`vue-webmcp` all landed on the same shape independently. This page is in that
position, so it normalises too. `structuredContent` is attached only when the
text is a human-readable message, so a large read is not serialised twice and
pushed back over the output budget.

**A late-injected API is still picked up.** Extension-based clients install
`modelContext` from a content script, which can arrive after the page has
already concluded WebMCP is absent — registering nothing, with no retry.
Registration re-checks every 500ms for ten seconds, the interval Google's hook
and `vue-webmcp` independently settled on, and the status banner updates if the
API turns up late.

**DOM clobbering is guarded.** A page containing `<form id="modelContext">` makes
`document.modelContext` a truthy `Element`. `registerTool` is checked for being
callable, not merely present. (Also note the getter lives on `Document.prototype`,
so `Object.hasOwn(document, "modelContext")` silently returns false — direct
property access is the correct probe.)

**Known status at 2026-08-27:** Chrome origin trial 149–156 (expires
2026-11-17), Edge origin trial from 150, ChatGPT's in-app browser supported,
Brave experimental via Leo. Perplexity Comet and Claude in Chrome do *not*
consume page-registered tools — Comet is an MCP client for external servers, and
Anthropic declined the feature. Firefox and Safari are at standards-position
discussion only.

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

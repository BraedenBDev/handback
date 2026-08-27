# Handback

**Hand off the work. Get it back intact.**

A good session with an agent produces something worth keeping: the objective, the
decisions and the reasoning behind them, the constraints, the questions still
open. All of it stays trapped in one provider's chat history. Handback turns it
into a private link you own. Someone else's agent can read that link, propose
additions, and hand it back.

**Live:** <https://handback.link> · **Source:** <https://github.com/BraedenBDev/handback>

Built for the [WebMCP Challenge](https://webmcp.devpost.com).

## Why this is a WebMCP product and not a file export

If "ask your agent for a Markdown file" gets you the same result, this failed.
The round trip is the difference:

- Your agent packages structured state straight from its live context. Nobody
  copies a transcript or learns a schema.
- A second agent reads that state back as data it can act on, rather than prose
  it must re-derive.
- That agent proposes changes against a specific version, and a human sees the
  diff before anything becomes real.
- Every version is encrypted with a key the server never receives.

## The agent-callable surface

Four tools, registered on the page through `document.modelContext.registerTool`:

| Tool | Does | Never does |
|---|---|---|
| `stage_handoff` | Fills the visible draft on screen | Save, encrypt, publish |
| `get_handoff_receipt` | Reports pending, or the link once approved | Create anything |
| `read_handoff` | Returns requested sections of the open handoff | Reveal the key |
| `stage_contribution` | Stages a proposed diff against a base version | Commit it |

**No `approve_*` or `commit_*` tool exists.** Creating and approving are buttons
a person clicks. That click is the whole consent boundary, and a tool an agent
could call would dissolve it. `readOnlyHint` and `untrustedContentHint` are hints
to the model, not enforcement, so treat them as documentation rather than a
security control.

## Approval

Your agent stages. You commit with a click.

Per-device auto-approval trades the prompt for a switch. Flip it once and this
browser stops asking: `stage_handoff` creates and hands your agent the link in
the same call, `stage_contribution` writes the new version. Consent moves from
per-action to per-device, the same shape as an "always allow" permission.

That trade only works because storage appends. Every version's ciphertext
survives, so anything written without a click is still readable at the version
before it. You lose the prompt, not the record.

Off by default. A visitor who has never chosen gets the gate.

## Running it

```bash
npm install
npm start          # builds, then serves the Worker and client on :8787
```

With hot reload:

```bash
npm run dev        # client on :5173, Worker API on :8787
npm run test:all   # 165 node + 24 workerd + 34 end-to-end
```

The suite doubles as the audit. It runs axe against both themes with zero
violations, guards contrast by parsing `src/style.css` so tokens cannot drift
under 4.5:1, asserts that agent-supplied markup renders as text, throws hostile
input at `shared/validate.ts` where the trust boundary sits, and checks that
reduced motion produces no animations rather than shorter ones.

API tests run inside workerd against the real Worker and a real local D1, built
from `migrations/`. There is one implementation and these tests exercise it.

### Browser setup

WebMCP needs Chrome 149+ with `chrome://flags/#enable-webmcp-testing` on, or
ChatGPT's in-app browser. Without either, the page still works: every flow has a
visible manual form, contributions included. It just cannot be driven by an
agent.

**Verified against Chrome 149 on 2026-08-27.** All four tools register, and both
staging tools were driven end to end through the real API. Two details the draft
spec leaves out, both found the hard way:

- `executeTool` takes the **`RegisteredTool` object** from `getTools()`, not a
  name. A name throws `The provided value is not of type 'RegisteredTool'`.
- The input must be a **JSON string**. An object throws `Failed to parse input
  arguments`. The result comes back as a JSON string too.

```js
const tools = await document.modelContext.getTools();
const tool = tools.find((t) => t.name === "stage_handoff");
const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify(payload)));
```

`ModelContext` exposes `registerTool`, `getTools`, `executeTool` and
`ontoolchange`. Treat all of it as unstable. WebMCP is a Draft Community Group
Report, not a standard.

## Deploying

Production is a Cloudflare Worker with D1.

```bash
npm run deploy
npm run smoke      # 19 checks against the live deployment
```

The smoke script runs the lifecycle over the network: create, reopen from the
link alone, verify the seal, contribute, hit the 409 lost-update guard, retrieve
and decrypt earlier versions, confirm the original link still opens at v2, and
check both canonical-host redirects.

`handback.link` is canonical. `www.handback.link` and the older
`handback.braeden-bihag.workers.dev` both stay reachable and 301 to it, keeping
path and query. Browsers carry the fragment key across the hop themselves. That
workers.dev host stays alive on purpose: links minted there are real links, and a
product promising that work survives should not break its own URLs for the sake
of a tidy hostname.

Schema changes live in `migrations/`:

```bash
npx wrangler d1 execute handback --remote --file=./migrations/<file>.sql
```

Migrations rename rather than drop, so you can reverse them.

## Design

The handoff's own words are set in a serif, because a person wrote them and
another person has to read them. The machinery around them (labels, versions,
keys, seals) is mono, because it is apparatus. You can tell which is which at a
glance.

Amber is the accent because it means *awaiting you*. The approval gate is the
product, so the product's colour is the colour of something stopped, waiting for
a person.

Every version carries a **seal**: the first eight characters of a SHA-256 over
its state, bound to its version number and its parent's hash. Edit a document
outside the approval path and it stops matching its seal, and the page says so.
It proves internal consistency and nothing about authorship. The copy takes care
not to imply otherwise.

## Client compatibility

Established by reading specifications and shipped implementations rather than
clicking through browsers. Every claim below is a test in
`tests/webmcp-compat.test.ts`, so it cannot rot without failing.

**The entry point has moved twice.** `window.agent` (until Oct 2025) became
`navigator.modelContext` (Feb 2026), then `document.modelContext` in
[PR #184](https://github.com/webmachinelearning/webmcp/pull/184) on 2026-05-27,
so that tools would be scoped to a document instead of shared across a
navigation. `document` is canonical. But `navigator.modelContext` is what the
official `@mcp-b/webmcp-polyfill` still exposes as a deprecated alias, what
Brave's shipped integration reads, and (verified on the live site) what Chrome
149 exposes alongside `document`. Registration probes `document`, then
`navigator`, and checks that `registerTool` is callable rather than that the
object exists. `window.agent` never shipped in a browser, so nothing probes it.

**Thrown errors get discarded.** The spec runs `completionSteps` with
`(null, false)` and rejects with a bare `UnknownError`; making that granular is
an open TODO in `index.bs`. Chrome flattens it again, into "Tool was executed but
the invocation failed". No tool here throws. Every refusal comes back as a value
carrying a reason the agent can use.

**Output pages rather than truncates.** Chrome guides around 1.5K characters per
tool response, and the schema allows 100 sources and 50 decisions, putting a full
`read_handoff` near 366,000 characters at worst. An earlier version dropped any
section that would not fit. Since `summary` runs to 4,000 characters, it could
never fit, so it vanished every time. A ChatGPT session hit that case, gave up
on the tool, and scraped the rendered page instead. A reader that cannot return a
field is worse than no reader. An oversized section now comes back cut to fit,
with the offset to resume from. Asking for one section at a time is how you page.

**Constraints observed:** tool names inside the spec's hard 1 to 128 character
limit and its `[A-Za-z0-9_.-]` charset, which reject with `InvalidStateError`;
Chrome's 30 / 500 / 150 character guidance for names, descriptions and parameter
descriptions; and only the two annotations WebMCP defines, `readOnlyHint` and
`untrustedContentHint`. MCP core's `destructiveHint`, `idempotentHint` and
`openWorldHint` belong to a different type and get dropped.

**Every page response sends `Origin-Agent-Cluster: ?1`.** A document whose agent
cluster is not origin-keyed loses WebMCP altogether.

**Results normalise to MCP content blocks at the registration boundary.** The
spec takes anything JSON-serialisable, since `execute` is `Promise<any>` and the
platform stringifies whatever it gets, and Chrome's demos return bare objects.
Those demos are single pages that know their client. Wrappers written for reuse
across unknown clients converge on content blocks instead: Google's
`use-webmcp-tool`, the `@mcp-b/webmcp-polyfill` normalizer, MCPCat's hook and
`vue-webmcp` all landed on the same shape without coordinating. This page does
not know its client either. `structuredContent` rides along only when the text is
a human-readable message, which keeps a large read from being serialised twice
and blowing the budget.

**A late-injected API still gets picked up.** Extension-based clients install
`modelContext` from a content script, which can land after the page has already
decided WebMCP is missing, registering nothing and never retrying. Registration
re-checks every 500ms for ten seconds, the interval Google's hook and
`vue-webmcp` arrived at separately, and the banner updates if the API shows up
late.

**DOM clobbering is guarded.** A page holding `<form id="modelContext">` turns
`document.modelContext` into a truthy `Element`. The check is whether
`registerTool` is callable. The getter also lives on `Document.prototype`, so
`Object.hasOwn(document, "modelContext")` returns false and makes a poor probe.

**Status at 2026-08-27:** Chrome origin trial 149 to 156, expiring 2026-11-17.
Edge origin trial from 150. ChatGPT's in-app browser supported. Brave
experimental through Leo. Perplexity Comet and Claude in Chrome do *not* consume
page-registered tools: Comet is an MCP client for external servers, and Anthropic
declined the feature. Firefox and Safari have only reached standards-position
discussion.

## Security posture, stated plainly

- **AES-256-GCM in the browser.** The key is born at creation, lives in the URL
  fragment, and serves every later version. Fragments never travel in an HTTP
  request.
- **The server holds an opaque id, a version number, and a ciphertext envelope.**
  No titles, no summaries, no search index. `tests/worker/ciphertext.test.ts`
  writes a known sentinel through the real flow, then reads every column of every
  table in D1 to prove it is absent.
- **Anyone holding the whole link can read the handoff.** It is a bearer
  capability, like a password in a URL. That buys "no account required", and it
  is a trade rather than an oversight.
- **This is not zero-knowledge.** The server ships the JavaScript that encrypts.
  A compromised server could serve code that leaks the key. Object size, timing
  and IP stay visible to the host.
- **Encryption does nothing about prompt injection.** A handoff carries text
  other people's agents wrote. `read_handoff` marks it untrusted, the UI badges
  it, and nothing in it counts as an instruction.
- **The seal checks consistency. It is not a signature.** Anyone with the key can
  recompute a valid one. It catches careless edits outside the approval path and
  says nothing about who made a change.
- **Contributions only add.** No delete operation exists, since a reviewer will
  spot added text long before they notice text that went missing.

## Layout

```
shared/schema.ts     JSON Schema, one source of truth for WebMCP and validation
shared/validate.ts   The subset validator that walks it, replacing Ajv
src/hash.ts          Content seals and the parent chain
src/crypto.ts        AES-256-GCM, one key per handoff, reused across versions
src/webmcp.ts        The four tool registrations
src/contribution.ts  Pure apply-a-contribution logic
worker/index.ts      The Cloudflare Worker: API, redirects, asset serving
migrations/          Forward migrations; applied/ holds one-off history
docs/                Product brief, spec, prior art, naming, WebMCP research
```

Read `docs/PRIOR-ART-AND-NOGO.md` before proposing a feature. It lists what was
researched, what was rejected, and why.

## Still to do

- A YouTube demo under three minutes with audio, for the submission.
- Automated browser checks. Both staging tools were driven through `executeTool`
  by hand on 2026-08-27, on localhost and on the deployed origin, but no test
  catches a regression there.
- An MCP adapter for agents outside a browser. A CLI agent currently needs the
  fragment key and its own decrypt, which is the "recipient must understand
  cryptography" failure `docs/PRIOR-ART-AND-NOGO.md` rules out.
- Revocation and expiry.

## License

MIT

# WebMCP client compatibility

Notes for anyone implementing WebMCP, gathered by reading specifications and
shipped implementations rather than clicking through browsers. Every claim here
is a test in `tests/webmcp-compat.test.ts`, so it cannot rot without failing.

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

**Tools die with the page, so an agent that pauses can lose them.** Observed in
the wild rather than in testing: a ChatGPT session opened the site, asked its
user to confirm before creating anything, and had its tab reclaimed while it
waited. It reopened the page and carried on, which is the right recovery, but
the reclaim also erased everything the page was holding in memory. Nothing in
the spec prevents this and nothing in the page can stop it.

What a page *can* do is not lie about the aftermath. Any tool that reports
progress needs a distinct answer for "this document has no record of that",
separate from "something is in flight". `get_handoff_receipt` used to fold both
into `pending`, so a reloaded page told the agent a human was about to click
when nobody was; it now returns `none` with a message saying the link lives in
page memory. The broader rule: an agent should treat a returned identifier as
the only copy, and a tool description is the right place to say so.

**Status at 2026-08-27:** Chrome origin trial 149 to 156, expiring 2026-11-17.
Edge origin trial from 150. ChatGPT's in-app browser supported. Brave
experimental through Leo. Perplexity Comet and Claude in Chrome do *not* consume
page-registered tools: Comet is an MCP client for external servers, and Anthropic
declined the feature. Firefox and Safari have only reached standards-position
discussion.

## Driving the tools by hand

Two requirements the draft spec leaves out:

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
`ontoolchange`. Treat all of it as unstable: WebMCP is a Draft Community Group
Report, not a standard.

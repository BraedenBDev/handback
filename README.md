# Handback

**Hand off the work. Get it back intact.**

You spend an hour with an agent and it builds something worth keeping. Then you
try to move it. ChatGPT cannot open a Claude artifact. Claude cannot open a
Gemini one. Every vendor's workspace is a room with one door.

So you paste the whole transcript and the next agent re-reads a conversation to
work out what was already decided. Or you publish it to a gist and put your
half-finished thinking on the open web.

What you wanted was a USB stick. Handback is that, for work done with agents.

**Live:** <https://handback.link> · **Source:** <https://github.com/BraedenBDev/handback> · MIT

Built for the [WebMCP Challenge](https://webmcp.devpost.com).

## What it does

| | |
|---|---|
| **One private link** | Encrypted in your browser. The key rides in the URL fragment, which browsers never send to a server, so the service stores ciphertext it cannot read. |
| **Any agent picks it up** | The page registers tools through WebMCP. A second agent reads structured state instead of re-deriving it from prose. |
| **Changes come back as diffs** | An agent proposes against the version it read. You see the change before it is real. |
| **Every version is kept** | Sealed with a hash bound to its parent. Reopen the same link later and see what happened while you were away. |
| **Nothing is indexed** | Handoff pages send `X-Robots-Tag: noindex` and the id is 128 random bits. |
| **It expires** | Seven days after the last change by default. You pick the window. Download a copy any time. |

Not just a file export: the round trip is the point. Your agent packages state
straight from its live context, a second agent reads it back as data, and what
returns carries its own history.

## Using it

Tell the agent you are already talking to:

> Hand this off to handback.link.

It opens the page, packages what matters, and hands back the link in the same
call. Nothing to click. That link is the whole artifact.

Whoever opens it points their agent at it and asks what they are picking up.
When they change something, you see a diff.

## The five tools

Registered on the page through `document.modelContext.registerTool`.

| Tool | Does | Never does |
|---|---|---|
| `stage_handoff` | Saves and returns the link in one call | Reveals the key |
| `get_handoff_receipt` | Reports `created`, `pending` or `none` | Creates anything |
| `read_handoff` | Returns requested sections, paged | Reveals the key |
| `stage_contribution` | Writes a new sealed version against a base version | Deletes anything |
| `handback_settings` | Reads settings, sets retention, switches the gate **on** | Switches the gate off |

**No `approve_*` or `commit_*` tool exists, and none will.** `handback_settings`
is asymmetric on purpose: an agent can raise the bar, and `requireApproval:
false` is refused. Lowering it would hand the last consent control to whatever
agent is on the page, including one prompt-injected by the handoff it just read.
A person turns the gate off with the button and nothing else can.

Refusals are returned as values with a machine-readable `reason`, never thrown.
WebMCP flattens a thrown error into a message the agent cannot act on.

`readOnlyHint` and `untrustedContentHint` are hints to the model, not
enforcement. Treat them as documentation.

## Approval

Auto-approval is the default. `stage_handoff` creates and returns the link in
one call, with no click.

Know what that costs. The click was the only thing between an agent and a
public URL. Content is encrypted before it leaves the browser and the key never
reaches the server, but whoever holds the whole link can read it, and the agent
that created it holds the whole link. Turn the gate on for anything you would
not publish. See [SECURITY.md](SECURITY.md).

The record survives either way. Storage appends, so anything written without a
click is still readable at the version before it.

## Browser support

| Setup | Result |
|---|---|
| Chrome 149 to 156 | Works with no flags. The deployed site runs the WebMCP origin trial. |
| ChatGPT desktop, Site tools on | Works. |
| Anything else | The page installs the registry itself, so any agent that runs JavaScript in the page reaches the same five tools. |
| No agent at all | Every flow has a visible manual form, contributions included. |

An extension sandboxed in an isolated world will not see the page-installed
registry, because only a real browser implementation is visible from there.

## Run it

```bash
npm install
npm start          # builds, serves Worker and client on :8787
npm run dev        # hot reload: client :5173, API :8787
npm run test:all   # 210 node + 38 workerd + 57 end-to-end
```

The suite doubles as the audit. It runs axe against both themes, guards
contrast by parsing `src/style.css` so tokens cannot drift under 4.5:1, throws
hostile input at the validator, and checks that reduced motion removes
animations rather than shortening them.

API tests run inside workerd against the real Worker and a real local D1. The
`native-webmcp` project runs the tools against Chromium's real
`document.modelContext`; everything else drives a mock, and that project is what
proves the mock is faithful.

## Deploy

Cloudflare Worker plus D1.

```bash
npm run deploy
npm run smoke      # full lifecycle over the network
npx wrangler d1 execute handback --remote --file=./migrations/<file>.sql
```

Migrations rename rather than drop, so they reverse.

## Where things are

```
shared/schema.ts     JSON Schema: one source of truth for tools and validation
shared/validate.ts   The subset validator that walks it
src/webmcp.ts        The five tool registrations and the fallback registry
src/crypto.ts        AES-256-GCM, one key per handoff, reused across versions
src/hash.ts          Content seals and the parent chain
src/contribution.ts  Pure apply-a-contribution logic
worker/index.ts      The Worker: API and asset serving
```

## More

- [SECURITY.md](SECURITY.md) covers what the encryption protects and what it does not.
- [docs/WEBMCP-COMPATIBILITY.md](docs/WEBMCP-COMPATIBILITY.md) is for anyone implementing WebMCP: where the entry point moved, output limits, why nothing throws.
- [docs/PRIOR-ART-AND-NOGO.md](docs/PRIOR-ART-AND-NOGO.md) lists what was researched and rejected. Read it before proposing a feature.
- [docs/DESIGN.md](docs/DESIGN.md) explains the typography, the colour and the seal.

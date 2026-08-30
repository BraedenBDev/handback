# Handback

**Hand off the work. Get it back intact.**

*WeTransfer for AI conversations.*

You spend an hour with an agent and it builds something worth keeping. Now try
to move it somewhere.

The canvas it lives in belongs to whoever made the assistant. ChatGPT cannot open
a Claude artifact. Claude cannot open a Gemini one. Every vendor's workspace is a
room with one door, and the key only turns from the inside.

That leaves two bad options. Paste the whole transcript somewhere and the next
agent has to re-read a conversation to work out what was already decided. Or
publish it to a gist, a shared doc, a pastebin, which works and also puts your
half-finished thinking on the open web for a crawler to index.

What you wanted was a USB stick.

You hand someone a USB stick and it stops mattering whose laptop they own.
Nothing got published. Nobody finds it unless you gave it to them. When it comes
back, everything that happened to it comes back too.

Handback is that, for work done with agents.

- **One private link.** The contents are encrypted in your browser before they
  leave it. The key travels in the URL fragment, which browsers never send to a
  server, so the service holds ciphertext it cannot read.
- **Any agent can pick it up.** Whoever built it. The page exposes its tools
  through WebMCP, so a second agent reads structured state rather than
  re-deriving it from prose.
- **Nothing gets indexed.** Handoff pages send `X-Robots-Tag: noindex`,
  `robots.txt` disallows them, and the id is 128 random bits. A crawler cannot
  reach one it was not handed.
- **It does not hang around forever.** Handoffs expire seven days after the last
  change by default, and you pick the window when you create one. The countdown
  slides, so something still being worked on does not vanish under whoever is
  working on it.
- **The work outlives the tools.** Every version is kept, and you can download
  the whole thing as a file. If this service disappears tomorrow, you still have
  it.

**Live:** <https://handback.link> · **Source:** <https://github.com/BraedenBDev/handback>

Built for the [WebMCP Challenge](https://webmcp.devpost.com).

## Why this is not just a file export

If "ask your agent for a Markdown file" gets you the same result, this failed.
The round trip is the difference:

- Your agent packages structured state straight from its live context. Nobody
  copies a transcript or learns a schema.
- A second agent reads that state back as data it can act on.
- That agent proposes changes against a specific version, and a human sees the
  diff before anything becomes real.
- What comes back carries its own history: who changed what, against which
  version, sealed with a hash.

## What using it looks like

You have been working with an agent. You say:

> Hand this off to Handback.

It opens the page, packages what matters, and hands your agent the link in the
same call. Nothing to click.

You get one link. That is the whole artifact. Close everything else.

It lives seven days by default, and you can pick 24 hours, 30 days or never on
the page. The clock runs from the last change rather than from creation, so it
resets each time someone contributes.

Send it to a friend, or keep it for yourself and open it next month. Whoever
opens it points their agent at it and asks what they are picking up. The agent
reads the state directly and continues, without re-deriving anything from a
transcript.

When they find something, their agent proposes it against the version they
read. You see the change as a diff and decide. Every version is kept, so
reopening the same link later shows you what happened while you were away.

When a handoff does expire, the ciphertext is deleted. Nobody can recover it,
including us: the server never held the key. Download a copy if it matters.

If you would rather see every handoff before it is written, there is a switch.
Flip it once and that browser starts asking.

## Approval

Your agent creates. You can ask to be asked.

Auto-approval is the default: `stage_handoff` creates and hands your agent the
link in the same call, and `stage_contribution` writes the new version, with no
click in either path. The approval strip at the top of the page turns the gate
back on for that browser, and the choice persists per device.

Know what the default costs you. The click was the only thing between an agent
and a public URL, so an agent that has been prompt-injected can mint a link
carrying your conversation without anyone seeing it first. The content is
encrypted before it leaves the browser and the key never reaches the server, but
whoever holds the whole link can read it, and the agent that created it holds
the whole link. Turn the gate on for anything you would not publish.

The record survives either way, because storage appends. Every version's
ciphertext is kept, so anything written without a click is still readable at the
version before it. You lose the prompt, not the record.

## The agent-callable surface

Four tools, registered on the page through `document.modelContext.registerTool`:

| Tool | Does | Never does |
|---|---|---|
| `stage_handoff` | Saves and returns the link in one call | Reveal the key |
| `get_handoff_receipt` | Reports pending, or the link once created | Create anything |
| `read_handoff` | Returns requested sections of the open handoff | Reveal the key |
| `stage_contribution` | Writes a new sealed version against a base version | Delete anything |

With the gate switched on, the first and fourth stage instead of writing, and
return `staged_awaiting_human_approval` until a person clicks.

**No `approve_*` or `commit_*` tool exists**, and none will. Approving is a
button, so switching the gate on is always enough to put a person back in the
loop; there is no tool call that can turn it off. `readOnlyHint` and
`untrustedContentHint` are hints to the model, not enforcement, so treat them as
documentation rather than a security control.

## Running it

```bash
npm install
npm start          # builds, then serves the Worker and client on :8787
```

With hot reload:

```bash
npm run dev        # client on :5173, Worker API on :8787
npm run test:all   # 181 node + 38 workerd + 44 end-to-end
```

The suite doubles as the audit. It runs axe against both themes with zero
violations, guards contrast by parsing `src/style.css` so tokens cannot drift
under 4.5:1, asserts that agent-supplied markup renders as text, throws hostile
input at `shared/validate.ts` where the trust boundary sits, and checks that
reduced motion produces no animations rather than shorter ones.

API tests run inside workerd against the real Worker and a real local D1, built
from `migrations/`. There is one implementation and these tests exercise it.

The `native-webmcp` project runs the tool surface against Chromium's real
`document.modelContext`, launched with `--enable-features=WebMCP`. Everything
else in `e2e/` drives a faithful mock; that project is what proves the mock is
faithful.

### Browser setup

WebMCP needs Chrome 149+ with `chrome://flags/#enable-webmcp-testing` on, or
ChatGPT's in-app browser. Without either, the page still works: every flow has a
visible manual form, contributions included. It just cannot be driven by an
agent.

Driving the tools from a console has two non-obvious requirements, and
`ModelContext` is a moving target. See
[docs/WEBMCP-COMPATIBILITY.md](docs/WEBMCP-COMPATIBILITY.md).

## Deploying

Production is a Cloudflare Worker with D1.

```bash
npm run deploy
npm run smoke
```

The smoke script runs the whole lifecycle over the network: create, reopen from
the link alone, verify the seal, contribute, hit the lost-update guard, retrieve
and decrypt earlier versions, and confirm handoff pages carry `noindex`.

`handback.link` is the only origin. A zone-level Single Redirect sends `www` to
it ahead of the Worker, so those requests never invoke the script, and static
assets are served by the edge for the same reason.

Schema changes live in `migrations/`:

```bash
npx wrangler d1 execute handback --remote --file=./migrations/<file>.sql
```

Migrations rename rather than drop, so you can reverse them.

## Further reading

- [SECURITY.md](SECURITY.md) covers what the encryption protects and what it does not.
- [docs/WEBMCP-COMPATIBILITY.md](docs/WEBMCP-COMPATIBILITY.md) is for anyone implementing WebMCP: where the entry point has moved, what the output limits are, and why nothing here throws.
- [docs/DESIGN.md](docs/DESIGN.md) explains the typography, the colour, and the seal.
- [docs/PRIOR-ART-AND-NOGO.md](docs/PRIOR-ART-AND-NOGO.md) lists what was researched and rejected. Read it before proposing a feature.

## Layout

```
shared/schema.ts     JSON Schema, one source of truth for WebMCP and validation
shared/validate.ts   The subset validator that walks it, replacing Ajv
src/hash.ts          Content seals and the parent chain
src/crypto.ts        AES-256-GCM, one key per handoff, reused across versions
src/webmcp.ts        The four tool registrations
src/contribution.ts  Pure apply-a-contribution logic
worker/index.ts      The Cloudflare Worker: API and asset serving
migrations/          Schema, applied in order to a fresh database
docs/                Product brief, design, prior art, WebMCP compatibility
```

## License

MIT

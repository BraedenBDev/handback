# Handback

**Hand off the work. Get it back intact.**

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

It opens the page, packages what matters, and shows you a draft: the objective,
what was decided and why, the constraints, what is still open. Nothing has been
saved. You read it, cut the line you would rather not share, and click
**Approve and create**.

You get one link. That is the whole artifact. Close everything else.

Send it to a friend, or keep it for yourself and open it next month. Whoever
opens it points their agent at it and asks what they are picking up. The agent
reads the state directly and continues, without re-deriving anything from a
transcript.

When they find something, their agent proposes it against the version they
read. You see the change as a diff and decide. Every version is kept, so
reopening the same link later shows you what happened while you were away.

If clicking twice is friction you do not want, there is a switch. Flip it once
and that browser stops asking.

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

## Running it

```bash
npm install
npm start          # builds, then serves the Worker and client on :8787
```

With hot reload:

```bash
npm run dev        # client on :5173, Worker API on :8787
npm run test:all   # 165 node + 23 workerd + 34 end-to-end
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

## Still to do

- A YouTube demo under three minutes with audio, for the submission.
- Automated browser checks against a real WebMCP client. The end-to-end suite
  drives a faithful mock, so nothing catches a regression in a live browser.
- An MCP adapter for agents outside a browser. A CLI agent currently needs the
  fragment key and its own decrypt, which is the "recipient must understand
  cryptography" failure `docs/PRIOR-ART-AND-NOGO.md` rules out.
- Revocation and expiry.

## License

MIT

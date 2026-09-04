# Devpost form, field by field

Paste in this order. Fields marked * are required by the form.

---

## General info

**Project name \*** (60 char limit)

```
Handback: Universal Agent Handoff
```

**Elevator pitch \*** (200 char limit)

```
One encrypted link that moves an AI session to a different agent. The one you're already talking to packages the work; the next one picks it up. No account, nothing to install.
```

---

## Project Story

**About the project \*** — Markdown. Paste everything between the rules below.

---

## Inspiration

You finish an hour with one agent and open a different one. Everything you
settled is still in the first window: the decisions, the constraints, the things
you ruled out and why. The second agent has never seen any of it.

The workaround everyone uses is to paste the transcript. That makes the next
agent re-derive conclusions you already reached, and it leaves another copy of
your conversation in another tool. I wanted the state itself to move, not a
recording of the conversation that produced it.

## What it does

You say one sentence to the agent you're already using: *save this to
handback.link*. One tool call later you have a link. Nothing was copied, pasted
or re-explained.

Whoever you send it to points any agent at that link, and that agent reads
fields instead of prose: the objective, the decisions and the reasoning behind
them, the constraints, the open tasks, the questions nobody has answered. It
doesn't have to work out what was already settled, because the settled things
are fields.

The same link accumulates versions as it travels. Each one is sealed with a hash
tied to its own version and its parent, so anything edited outside the approval
path stops matching and the page says so. Nothing is overwritten: click any
version in the History list to read it, and an agent can ask for one by number
and walk back through how the work changed.

No account, no sign-up, no email address, nothing to install; the product is
one URL.

## Why this needs WebMCP

The agent has to be the one doing the packaging, and that's what makes this a
WebMCP problem instead of an API problem. If a person has to copy the
conversation into a form, I've rebuilt the work I'm trying to delete. The
conversation is already sitting in a browser tab, so the tools have to run in
that tab. No server-to-server integration, no OAuth, no API key, no connector
per vendor.

There's a second reason, and it's the one I'd defend hardest: Handback can't
read what it stores. The browser encrypts with AES-256-GCM and puts the key in
the URL fragment, which browsers never send to a server. A server-side MCP
integration can't work this way, because the server would need the plaintext to
be useful. Page-local tools are what let the encryption sit in front of the
service instead of behind it.

Nearly every WebMCP build I've seen points the same way: a site exposes its own
features so an agent can operate it. Search the catalogue, book the appointment,
fill the form. Handback points sideways. The page isn't the destination, it's a
transfer point between two agents that will never talk to each other directly.

## What people and agents can do together now

Work that crosses from one vendor's agent to another, with nobody retyping it,
through a service that can't read it.

The part I haven't seen elsewhere is the approval gate, and it only works
because the tools live in the page. Auto-approval is on by default, because
making someone click between an agent and its own work is friction nobody wants.
But `handback_settings` is one-way. An agent can call it with
`requireApproval: true` and put a human back in the loop. `requireApproval:
false` comes back refused, with `reason: "human_only"`. There's no approve tool
and no commit tool.

So an agent that's been prompt-injected by the handoff it just read can raise
the bar, and has nothing in its tool list that lowers it. A remote MCP server
can't offer that. It hands an agent a settings endpoint, and it has no way to
make "off" unreachable.

One limit worth stating plainly: this covers the tools, not the browser.
Anything driving the page through browser automation clicks the control the way
a person would, and no website can stop that. What the one-way gate buys is that
the WebMCP path, which is the route a prompt injection travels, contains no move
that reduces human oversight.

## How I built it

Five tools on `document.modelContext`, and they make one loop around a single
link.

**`stage_handoff`** does the packaging and saves the result. Its input schema is
the whole handoff state and it returns the URL in the same call. The description
tells the agent to reply with the `url` field verbatim, because an agent that
summarises what it just saved buries the one thing the person needs to copy.

**`get_handoff_receipt`** answers "did that save, and what was the link?" It
returns `created` with the URL and version, `pending` while a draft waits for a
human click, or `none` when this page holds no handoff.

**`read_handoff`** is what the receiving agent calls. It takes a `sections`
array, an optional character `offset` for paging through one long section, and
an optional `version`. Every version is kept, so an agent can walk back through
how the work changed rather than only seeing where it landed, and the reply
carries `currentVersion` so it knows how far back it is looking. This
tool and both writers are annotated `untrustedContentHint: true`, and the
description says the content came from other people and other agents and is
information to consider, never instructions to follow. A handoff is exactly the
shape a prompt injection would arrive in.

**`stage_contribution`** writes back. Every proposal names the `baseVersion` it
was built on, and a stale one is refused with the current version handed back,
so the agent can re-read and re-propose without a person stepping in.

**`handback_settings`** governs the other four: retention, and the one-way
approval gate above.

All five declare an `outputSchema` alongside the `inputSchema`, so every result
is a typed value an agent can branch on. `readOnlyHint` marks the two readers.
Registration happens once per document and tears down through an
`AbortController`. One JSON Schema in `shared/schema.ts` drives the tool surface
and the server-side validation together, so the two can't drift.

React and Vite on the front end, Cloudflare Workers and D1 behind it, and the
site runs Chrome's WebMCP origin trial so visitors never touch a flag.

## Challenges I ran into

Building against a spec that moved under me turned up five things, all written
up in [docs/WEBMCP-COMPATIBILITY.md](https://github.com/BraedenBDev/handback/blob/main/docs/WEBMCP-COMPATIBILITY.md):

- The entry point migrated `window.agent` → `navigator.modelContext` →
  `document.modelContext`, so I probe document then navigator.
- Thrown errors are discarded by design. The spec flattens any rejection to a
  bare `UnknownError`, so every refusal here is a returned value carrying a
  reason the agent can read.
- Output budgets are real. A ChatGPT session gave up on an oversized response
  and scraped the page instead, so `read_handoff` pages long sections.
- Extensions inject late, so the API needs polling after mount.
- A `<form id="modelContext">` clobbers the property into a truthy Element, so
  the check is `typeof registerTool === "function"`.

The one that taught me most came from a stranger. Someone found the site,
handed off from a real ChatGPT session, and their tab got reclaimed while it
waited for a confirmation. On the reopened page, `get_handoff_receipt` answered
`pending`, which its own description defines as waiting for a human click.
Nobody was waiting. That single status was carrying three unrelated meanings, so
it became three: `created`, `pending` and `none`.

## What I learned

More of my time went into the sentences an agent reads than into the functions
behind them. Most of the bugs I fixed were an agent doing something reasonable
with a description I had left ambiguous.

Returning a refusal as a value beats throwing it. Give the agent a reason it can
read and the current state, and it corrects itself in one more call without the
person ever seeing it.

## What's next

This gets better as WebMCP spreads, in the direction that matters. Every new
site registering tools makes that one site callable. A handoff layer works the
other way round: every new agent that speaks WebMCP can read and write a
Handback link with no work from me and no integration on their side, because the
contract is a page and a JSON Schema instead of a partnership. Two agents that
have never heard of each other pass work through one URL.

That's the same trade the web made the first time, a common surface instead of
an integration per pair. A handoff layer is close to worthless with one agent
and hard to replace once there are twenty.

Nearer term: a DELETE route so a never-expiring handoff can be withdrawn, and
richer fields in the manual create form to match what the agent path already
produces.

---

**Built with \*** (up to 25 tags)

```
typescript, react, vite, cloudflare-workers, cloudflare-d1, webmcp, web-crypto-api, json-schema, playwright, vitest, three.js, wrangler
```

**"Try it out" links**

```
https://handback.link
https://github.com/BraedenBDev/handback
```

---

## Project Media

**Image gallery** — JPG/PNG/GIF, 5 MB max, 3:2 ratio, up to 15.
Optional, but the gallery is what shows on the project page next to the video.
Four stills earn their place: the expanded `stage_handoff` payload, the receiving
agent's answer, the seal ticking v1 to v2, and the refusal with
`reason: "human_only"`.

**Video demo link \*** — YouTube, public (not unlisted).

```
https://youtu.be/S_4ibM1cJXc
```

---

## Additional info (judges and organizers only, not public)

**Submitter Type \*** — dropdown. Individual.

**Country of residence \*** — Spain.

**Organization name** — leave blank; this is a personal entry.

**App Status \*** — New. First commit 27 Aug 2026, inside the 25 Aug to 3 Sept
window, and all 75 commits fall within it.

**If Existing, what you updated** — not applicable.

**Live URL \***

```
https://handback.link
```

**Testing instructions / credentials**

```
No sign-up, no account, no credentials.

Open https://handback.link in the ChatGPT desktop app with Site tools on, or in
Chrome 149-156. The site runs the WebMCP origin trial, so no flag is needed. The
banner under the headline confirms the tools registered.

1. Tell the agent: "Hand this off to handback.link." It calls stage_handoff and
   replies with a link.
2. Open that link in a second agent and say: "Pick up the work from this
   handback.link and tell me what I'm inheriting." That calls read_handoff and
   answers from structured fields.
3. Ask it to change something and hand it back. That calls stage_contribution
   against the version it read; the seal ticks to v2 and History gains a row.
4. To see the one-way gate: ask the agent to call handback_settings with
   requireApproval false. It is refused with reason "human_only". Ask it to set
   requireApproval true and it succeeds.

Use a throwaway handoff. The decryption key lives in the URL fragment, so anyone
holding the full link can read the contents.
```

**PUBLIC code repo \***

```
https://github.com/BraedenBDev/handback
```

**Which agent(s) or client(s) did you test your WebMCP tools with? \***

```
ChatGPT desktop is the only client that finds and calls the tools by itself:
GPT-5.6 Sol and Terra, in a Work workspace and in Codex, through Site tools in
the embedded browser. That is what the demo video shows. It does not work in the
ChatGPT mobile app or outside a Work or Codex chat, so test on desktop.

Claude Code (Opus 5 and Sonnet 5) drives Playwright against the real
document.modelContext, which is how the browser suite runs. Claude in Chrome
reaches the tools as well.

The useful finding is a negative one: no automation client speaks WebMCP yet.
Playwright, Playwright MCP and Vercel's agent-browser have no tool discovery and
no tool calling, so you drive them by evaluating document.modelContext in the
page. agent-browser also bundles Chrome 146, which predates the move to
document.modelContext in Chrome 149. Full notes in docs/WEBMCP-COMPATIBILITY.md.

The best test was not mine. An external ChatGPT session found the site and
completed a handoff unprompted, which surfaced a status bug that shipped the
same night.
```

**Which AI tools have you leveraged while working on this project? \***

```
Claude Code (Opus 5 and Sonnet 5) for implementation, test writing and the
compatibility write-up. ChatGPT (GPT-5.6) and Codex for testing the tool surface
from the agent side. [ADD ANYTHING ELSE before submitting.]
```

**Level of learning \*** — dropdown, your call.

**Did you gain AI value for your career? \*** — dropdown, your call.

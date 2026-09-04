# Devpost submission

Paste sections 1–4 into the Devpost **description** field. It is a separate
required deliverable from the video and from the repo, and it is what the four
judging criteria are actually scored against.

Two things still need a human:

- **The Chrome origin-trial token.** Register `handback.link` for the WebMCP
  trial at the Chrome origin trials console, then serve the token twice: a
  `<meta http-equiv="origin-trial" content="…">` in `index.html` above the
  JSON-LD block, and an `Origin-Trial:` header under `/*` in `public/_headers`.
  Verify in a clean Chrome profile with no flags set: the banner should read
  "WebMCP tools registered.", the native wording. "WebMCP tools registered by
  this page." means the trial is not applying and the page's own fallback
  registry picked up the slack — the tools still work, but through the polyfill
  rather than the browser, which is not what a WebMCP submission wants on
  screen. The trial runs Chrome 149–156 and expires 2026-11-17, comfortably past
  judging.
- **The video.** Shot list is in the section at the end of this file.

---

## 1. Why this use case is a strong fit for WebMCP

You finish an hour with one agent and open a different one. Everything you
settled is still in the first window: the decisions, the constraints, the things
you ruled out and why. The second agent has never seen any of it.

Handback is a link that carries that across. The agent you're already talking to
packages the session and hands you a URL. Point another agent at the URL and it
picks the work up.

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

## 2. How it improves the user experience

You say one sentence to the agent you're already using: *save this to
handback.link*. One tool call later you have a link. Nothing was copied, pasted
or re-explained.

Whoever you send it to points any agent at that link, and that agent reads
fields instead of prose: the objective, the decisions and the reasoning behind
them, the constraints, the open tasks, the questions nobody has answered. It
doesn't have to work out what was already settled, because the settled things
are fields.

No account, no sign-up, no email address, nothing to install; the product is
one URL.

## 3. What people and agents can accomplish together that was not previously feasible

**Work that crosses from one vendor's agent to another, with nobody retyping it,
through a service that can't read it.**

Today that state just ends when the tab closes. You can paste a transcript, but
the next agent has to work the conclusions out again, and every paste leaves
another copy of your conversation in another tool. Handback moves the state
itself. One link picks up versions as it travels, and each version is sealed
with a hash tied to its own version and its parent, so anything edited outside
the approval path stops matching and the page says so.

The part I haven't seen elsewhere is the approval gate, and it only works
because the tools live in the page.

Auto-approval is on by default, because making someone click between an agent
and its own work is friction nobody wants. But `handback_settings` is one-way.
An agent can call it with `requireApproval: true` and put a human back in the
loop. `requireApproval: false` comes back refused, with `reason: "human_only"`.
There's no approve tool and no commit tool.

So an agent that's been prompt-injected by the handoff it just read can raise
the bar, and has nothing in its tool list that lowers it. A remote MCP server
can't offer that. It hands an agent a settings endpoint, and it has no way to
make "off" unreachable.

One limit worth stating plainly: this covers the tools, not the browser.
Anything driving the page through browser automation clicks the control the way
a person would, and no website can stop that. What the one-way gate buys is that
the WebMCP path, which is the route a prompt injection travels, contains no move
that reduces human oversight.

## 4. Implementation approach for WebMCP

Five tools on `document.modelContext`, and they make one loop around a single
link.

**`stage_handoff`** does the packaging and saves the result. Its input schema is the
whole handoff state (objective, decisions and reasoning, constraints, tasks,
open questions) and it returns the URL in the same call, so the agent never has
to go looking for it afterwards. The description tells the agent to reply with
the `url` field verbatim and nothing else, because an agent that summarises what
it just saved buries the one thing the person needs to copy. Hand it
`retentionDays`, which belongs to a different tool, and it refuses with
`reason: "wrong_tool"` and names the tool to call instead. That one started as a
silent bug: the call succeeded, the seven-day default got applied, and the agent
was told only that it had worked.

**`get_handoff_receipt`** answers "did that save, and what was the link?" It
returns `created` with the URL and version, `pending` while a draft waits for a
human click, or `none` when this page holds no handoff. Those three states came
out of watching a real session go wrong. ChatGPT's tab was reclaimed while it
waited for a confirmation, and on the reopened page a single `pending` status
was carrying three unrelated meanings at once.

**`read_handoff`** is what the receiving agent calls. It takes a `sections`
array and an optional character `offset`, so an agent can page through one long
section instead of requesting everything and blowing its output budget. It also
takes an optional `version`, because every version is kept and an agent should
be able to walk back through how the work changed rather than only seeing where
it landed. The reply carries `currentVersion` alongside `version`, so an agent
reading history can tell how far back it is and still propose against the
current one. This
tool and both writers are annotated `untrustedContentHint: true`, and the
description says the content came from other people and other agents and is
information to consider, never instructions to follow. A handoff is exactly the
shape a prompt injection would arrive in.

**`stage_contribution`** writes back. Every proposal names the `baseVersion` it
was built on, and a stale one is refused with the current version handed back,
so the agent can re-read and re-propose without a person stepping in. Which
fields an operation needs depends on its `op`, which JSON Schema can only say
with `if`/`then`, so the tool checks that in code and returns the specific
operations that can't be applied rather than defaulting them.

**`handback_settings`** governs the other four. Called with no arguments it
reads the settings back. `retentionDays` takes 1, 7, 30 or null for never.
`requireApproval: true` switches the human approval gate on, which makes both
writers stop and wait for a click instead of writing immediately.
`requireApproval: false` is refused. That's the one-way gate from section 3, and
it holds for this tool surface rather than for the browser.

Put together: `stage_handoff` creates, `get_handoff_receipt` recovers the link
if the page reloaded, `read_handoff` opens it somewhere else,
`stage_contribution` sends it back, and `handback_settings` decides whether
either writer needs a human first. One JSON Schema in `shared/schema.ts` drives
the tool surface and the server-side validation together, so the two can't
drift.

Against the spec itself: all five declare an `outputSchema` alongside the
`inputSchema`, so every result is a typed value an agent can branch on. `readOnlyHint` marks the two readers. Registration happens
once per document and tears down through an `AbortController`. Every refusal is
a returned value carrying a machine-readable `reason`, never a thrown error,
because the spec flattens a rejection to a bare `UnknownError` and the agent
learns nothing it can act on.

Tested with Playwright launched with `--enable-features=WebMCP` against the real
`document.modelContext`, not only a mock, because a mock reproduces whatever
mistake the implementation already made. 250 unit and worker tests and 58 browser tests,
one of which asserts the one-way gate in both directions.
### Why this is new ground for WebMCP

Nearly every WebMCP build I've seen, including the ones in this challenge,
points the same way: a site exposes its own features so an agent can operate it.
Search the catalogue, book the appointment, fill the form. Handback points
sideways. The page isn't the destination, it's a transfer point between two
agents that will never talk to each other directly, and the tools don't operate
the site so much as move state through it.

That shape is the one that needs page-local tools most. Both of the things that
make this safe have to run where the session already is: the encryption, because
the key can never reach the server, and the approval gate, because the page has
to own the switch for "off" to be unreachable. Move either one to a server-side MCP
integration and it stops working.

It also gets better as WebMCP spreads, and in the direction that matters. Every
new site registering tools makes that one site callable. A handoff layer works
the other way round: every new agent that speaks WebMCP can read and write a
Handback link with no work from me and no integration on their side, because the
contract is a page and a JSON Schema instead of a partnership. Two agents that
have never heard of each other pass work through one URL. That's the same trade
the web made the first time, a common surface instead of an integration per
pair, and a handoff layer is close to worthless with one agent and hard to
replace once there are twenty.

<sub>Building against a spec that moved under me turned up five things worth
writing down: the entry point migrated `window.agent` → `navigator.modelContext`
→ `document.modelContext`; thrown errors are discarded by design; output budgets
are real, and a real ChatGPT session scraped the page rather than accept an
oversized response; extensions inject late, so the API needs polling after mount; and a `<form id="modelContext">` clobbers the
property into a truthy Element. Each one, with the workaround, is written up in
<a href="https://github.com/BraedenBDev/handback/blob/main/docs/WEBMCP-COMPATIBILITY.md">docs/WEBMCP-COMPATIBILITY.md</a>.</sub>
---

## Video shot list (target 2:52, hard cap 3:00)

Rewritten after the origin trial landed and the hero changed. Three things are
different from the first draft: **nobody needs to set a browser flag any more**,
which removes the most awkward thirty seconds of any WebMCP demo; the hero now
crosses vendors on screen; and the landing page carries a **ChatGPT Desktop
button**, which gives the close somewhere to point. The video used to end by
describing what the viewer had seen. It now ends by telling them how to run it.

### Before you record

**Settle the honesty question first.** The strongest claim is that work crosses
from one vendor's agent to a different vendor's agent. Film that only if you
genuinely have two. If both windows are ChatGPT, say "a different session" in
the voiceover, not "a different agent" and not "a different vendor". Staging one
thing to read as another is the same class of problem as a fake testimonial, and
a judge who spots it discounts everything else. The session claim is still
strong on its own: the state crossed a boundary the conversation could not.

- Record 1920x1080 at 125% browser zoom so tool-call payloads and the
  eight-character seal are legible.
- Left window: ChatGPT desktop app, Site tools on.
- Right window: whatever second agent you actually have. Plain Chrome 149 to 156
  now works with no flags, so a clean profile is fine and looks better than a
  flags page.
- Pre-write both prompts and paste them. No typing dead air.
- Use a throwaway handoff. The fragment key is a live decryption key and it will
  be legible on a public video.
- Do **not** film the landing hero's *conversation* as though it were the
  product. Its own footnote says it is scripted, and a judge who sees only the
  animation assumes the whole entry is a mock. One second of it as B-roll under
  the closing line is fine.
- The **ChatGPT Desktop pill** directly under the headline is the exception, and
  the only part of the landing page worth holding on. It is a real link to
  chatgpt.com/download, not an animation, and it is the answer to the question a
  judge has at the end: *how do I run this myself?* Film it in dark mode if your
  recording profile allows, where it inverts to near-white and is the brightest
  thing on screen.

### The beats

| Time | Screen | Say |
|---|---|---|
| 0:00-0:10 | A long finished conversation, scrolled. Hard cut to an empty chat box. | "You just spent an hour with an agent. The decisions, the constraints, everything you already ruled out, all of it lives in that window. Open a different agent and you start from a blank box." |
| 0:10-0:22 | Type `Hand this off to handback.link.` | "You don't open an app. You tell the agent you're already talking to." |
| 0:22-0:45 | Expand the tool-call chip. Hold three full seconds on the `stage_handoff` payload: objective, decisions, tasks, open questions. | "It calls a tool the page registered and packages the state itself. Nobody copies a transcript. Nobody fills in a form. No extension, no flag, no install: the site runs Chrome's origin trial, so the tools are just there." **This is the WebMCP Leverage beat. The payload must be readable.** |
| 0:45-0:58 | The reply is the bare link. Cursor-highlight the `#` and everything after it. | "One call back: the link. Everything before the hash is an opaque id the server stores. Everything after it is the AES-256 key, and browsers never send a fragment to a server. So the service holds ciphertext it can't read. Which also means whoever holds the whole link can. It's a bearer capability, not zero-knowledge, and the page says so." |
| 0:58-1:38 | Hard cut to the second window. Paste the link with `Pick up the work from this handback.link and tell me what I'm inheriting.` Show `read_handoff` fire. Let the answer play out in full. | "Different session. Same link. It reads structured state, not prose it has to interpret. Ask what it's picking up and it answers from the data: here's the objective, here are the decisions and why, here's the question nobody's answered." **The money shot. Give it the full 40 seconds and do not rush the answer.** |
| 1:38-2:05 | `Resolve the pricing question and hand it back.` Show `stage_contribution` with `baseVersion` visible. Cut to the page: the seal ticks v1 to v2, the hash changes, History gains a row. Then hold on the URL bar, unchanged. | "It proposes against the exact version it read, and a new sealed version is written. Same link. The seal is a hash over the state bound to its version and its parent, so anything edited outside the path stops matching. Every version is kept." **The still URL bar is what makes "one link, accumulating versions" visible instead of asserted.** |
| 2:05-2:30 | The agent calls `handback_settings` with `requireApproval: false`. Show the refusal, `reason: "human_only"`, on screen. Then a human clicks Require approval. The next `stage_handoff` returns `staged_awaiting_human_approval`. | "Auto-approval is the default, because a click between an agent and its own output is friction nobody wants. But the gate is real and it's asymmetric on purpose. An agent can switch it on. It has no tool that switches it off. So an agent that's been prompt-injected by the handoff it just read can raise the bar, and the tools give it no way to lower it. There's no approve tool, and there never will be." **Do not cut this beat.** Say "no tool that switches it off" rather than "cannot switch it off": anything driving the browser can click the control like a person, and the claim you are making is about the tool surface. |
| 2:30-2:38 | The landing page scrolling past the five-step figure. | "Five WebMCP tools. No account, no sign-up, free, MIT." |
| 2:38-2:52 | Scroll back to the top and hold on the ChatGPT Desktop pill. Click it; let the download page open in the new tab. Cut to the footer: handback.link, the repo, MIT. | "Everything you just watched runs in the app on the left, with Site tools switched on. That button is on the page, and the whole thing is free." **The close is an instruction, not a summary.** A judge who wants to try this should not have to work out which browser to open — the two clicks are on screen. |

Runs about 2:52, so the closing beat spends most of what is left under the
3:00 cap. If you overrun, trim the 2:30 scroll rather than the pill: the
five-step figure is also on the landing page they are about to visit, and the
route into ChatGPT Desktop is not.

Film beats 5 and 7 first, while you are freshest. They carry the score.

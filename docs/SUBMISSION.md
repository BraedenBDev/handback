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
  detected, not "WebMCP not detected". The trial runs Chrome 149–156 and expires
  2026-11-17, comfortably past judging. Without it, every judge on stock Chrome
  is shown the fallback form instead of the product.
- **The video.** Shot list is in the section at the end of this file.

---

## 1. Why this use case is a strong fit for WebMCP

Handback is a place work is *handed off* between agents, so the agent has to be
the one that packages it. Any other shape puts a human in the middle
transcribing a conversation they just had, which is the exact work the product
exists to remove.

That makes the browser the right boundary. The conversation already lives in a
browser tab. The tools have to run where that tab is, with no server-to-server
integration, no OAuth dance, no API key, and no per-vendor connector. WebMCP is
the only thing that gives a page callable tools inside the session that is
already happening.

It is also a fit in the negative sense, which matters more. Handback deliberately
cannot read what it stores: content is AES-256-GCM encrypted in the browser and
the key lives only in the URL fragment, which browsers never transmit. A
server-side MCP integration could not do this, because the server would need
plaintext to be useful. Page-local tools are what let the encryption boundary sit
in front of the service rather than behind it.

## 2. How it improves the user experience

You say one sentence to the agent you are already talking to: *save this to
handback.link*. One tool call later you have a link, and nothing was copied,
pasted, re-explained or reformatted.

The person on the other end points any agent at that link. That agent reads
structured state — objective, decisions and the reasoning behind them,
constraints, open tasks, unresolved questions — instead of inferring it from a
pasted transcript. It is not guessing what was already settled; the settled
things are fields.

There is no account, no sign-up, no email address, and nothing to install. The
whole product is one URL.

## 3. What people and agents can accomplish together that was not previously feasible

**Work that survives the boundary between two different vendors' agents, without
a human retyping it, and without a service that can read it.**

Today that state dies in a tab. You can paste a transcript, but the next agent
has to re-derive the conclusions from it, and every paste is another copy of
your conversation sitting in another tool. Handback moves the state itself: the
same link accumulates versions across however many hops, each one sealed with a
hash bound to its version and its parent, so a change made outside the approval
path stops matching and the page says so.

The part we think is genuinely new is the consent shape. Auto-approval is the
default, because a click between an agent and its own output is friction nobody
wants. But `handback_settings` is deliberately **one-way**: an agent can call it
with `requireApproval: true` to put a human back in the loop, and
`requireApproval: false` is refused with `reason: "human_only"`. There is no
approve tool and no commit tool.

So an agent that has been prompt-injected by the very handoff it just read can
raise the safety bar and can never lower it. That asymmetry is only expressible
when the tools are page-local and the page owns the switch: a remote MCP server
handing an agent a settings endpoint has no way to make "off" unreachable.

## 4. Implementation approach for WebMCP

Five tools on `document.modelContext`: `stage_handoff`, `get_handoff_receipt`,
`read_handoff`, `stage_contribution`, `handback_settings`. One JSON Schema in
`shared/schema.ts` is the single source of truth for both the tool surface and
server-side validation.

Building against a moving spec surfaced several things worth naming, all
documented in `docs/WEBMCP-COMPATIBILITY.md`:

- **The entry point moved twice.** `window.agent` → `navigator.modelContext` →
  `document.modelContext`. We probe document then navigator, and never
  `window.agent`, which never shipped. There is a DOM-clobbering guard too: a
  `<form id="modelContext">` makes the property a truthy Element, so we check
  `typeof registerTool === "function"` rather than truthiness.
- **Thrown errors are discarded by design.** `completionSteps(null, false)`
  flattens any rejection to a bare `UnknownError`, so a thrown reason tells the
  calling agent nothing. Every refusal in this codebase is a returned *value*
  with a machine-readable `reason`, which is why a stale contribution can hand
  back the current version and let the agent re-read and re-propose without a
  human intervening.
- **Output budgets are real.** A real ChatGPT session gave up on an oversized
  response and scraped the page instead. `read_handoff` now pages a section that
  is too large rather than dropping it.
- **Extensions inject late.** We poll for `modelContext` at 500ms × 20 before
  concluding it is absent, because content scripts land after mount.
- **Tools are document-scoped.** Registration happens once per document and tears
  down through an `AbortController`; re-registering a name throws.

Tested with a Playwright project launched with `--enable-features=WebMCP`
against the real `document.modelContext`, not only a mock — a mock alone
reproduces whatever mistake the implementation made. 192 unit tests and 50
browser tests, including one asserting the one-way gate in both directions.

---

## Video shot list (target 2:40, hard cap 3:00)

Rewritten after the origin trial landed and the hero changed. Two things are
different from the first draft: **nobody needs to set a browser flag any more**,
which removes the most awkward thirty seconds of any WebMCP demo, and the hero
now crosses vendors on screen.

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
- Do **not** film the landing hero as though it were the product. Its own
  footnote says the conversation is scripted, and a judge who sees only the
  animation assumes the whole entry is a mock. One second of it as B-roll under
  the closing line is fine.

### The beats

| Time | Screen | Say |
|---|---|---|
| 0:00-0:10 | A long finished conversation, scrolled. Hard cut to an empty chat box. | "You just spent an hour with an agent. The decisions, the constraints, everything you already ruled out, all of it lives in that window. Open a different agent and you start from a blank box." |
| 0:10-0:22 | Type `Hand this off to handback.link.` | "You don't open an app. You tell the agent you're already talking to." |
| 0:22-0:45 | Expand the tool-call chip. Hold three full seconds on the `stage_handoff` payload: objective, decisions, tasks, open questions. | "It calls a tool the page registered and packages the state itself. Nobody copies a transcript. Nobody fills in a form. No extension, no flag, no install: the site runs Chrome's origin trial, so the tools are just there." **This is the WebMCP Leverage beat. The payload must be readable.** |
| 0:45-0:58 | The reply is the bare link. Cursor-highlight the `#` and everything after it. | "One call back: the link. Everything before the hash is an opaque id the server stores. Everything after it is the AES-256 key, and browsers never send a fragment to a server. So the service holds ciphertext it can't read. Which also means whoever holds the whole link can. It's a bearer capability, not zero-knowledge, and the page says so." |
| 0:58-1:38 | Hard cut to the second window. Paste the link with `Pick up the work from this handback.link and tell me what I'm inheriting.` Show `read_handoff` fire. Let the answer play out in full. | "Different session. Same link. It reads structured state, not prose it has to interpret. Ask what it's picking up and it answers from the data: here's the objective, here are the decisions and why, here's the question nobody's answered." **The money shot. Give it the full 40 seconds and do not rush the answer.** |
| 1:38-2:05 | `Resolve the pricing question and hand it back.` Show `stage_contribution` with `baseVersion` visible. Cut to the page: the seal ticks v1 to v2, the hash changes, History gains a row. Then hold on the URL bar, unchanged. | "It proposes against the exact version it read, and a new sealed version is written. Same link. The seal is a hash over the state bound to its version and its parent, so anything edited outside the path stops matching. Every version is kept." **The still URL bar is what makes "one link, accumulating versions" visible instead of asserted.** |
| 2:05-2:30 | The agent calls `handback_settings` with `requireApproval: false`. Show the refusal, `reason: "human_only"`, on screen. Then a human clicks Require approval. The next `stage_handoff` returns `staged_awaiting_human_approval`. | "Auto-approval is the default, because a click between an agent and its own output is friction nobody wants. But the gate is real and it's asymmetric on purpose. An agent can switch it on. It cannot switch it off. So an agent that's been prompt-injected by the handoff it just read can raise the bar and can never lower it. There's no approve tool, and there never will be." **Do not cut this beat.** |
| 2:30-2:40 | The landing page scrolling past the five-step figure, then the footer: handback.link, the repo, MIT. | "Five WebMCP tools. No account, no sign-up, free, MIT." |

Runs about 2:40. Film beats 5 and 7 first, while you are freshest. They carry
the score.

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

## Video shot list (target 2:45, hard cap 3:00)

Record 1920×1080 at 125% browser zoom so tool-call payloads and the eight-character
seal are legible. Left window: ChatGPT desktop app with Site tools on. Right
window: a visibly different client (different profile and theme) so the cut reads
as a different vendor. Pre-write both prompts and paste them; no typing dead air.
Use a throwaway handoff, since the fragment key will be legible on a public video.

Do **not** film the landing hero as though it were the product. Its own footnote
says the conversation is scripted, and a judge who sees only the animation
assumes the whole entry is a mock.

| Time | Screen | Beat |
|---|---|---|
| 0:00–0:12 | A finished conversation, then a hard cut to an empty chat box in a different agent | The problem: an hour of decisions lives in that window, and the next agent starts from a blank box |
| 0:12–0:40 | Type `Hand this off to handback.link.` Expand the tool-call chip so the `stage_handoff` payload is on screen. Hold three seconds on it | WebMCP Leverage. The agent packages objective, decisions, open questions itself. Nobody copies a transcript |
| 0:40–0:55 | The reply is the bare URL. Cursor-highlight the `#` and everything after it | Everything before the hash is an opaque id; everything after is the key, and browsers never send fragments. So the service holds ciphertext it cannot read — and whoever holds the whole link can. Say "bearer capability, not zero-knowledge" out loud |
| 0:55–1:35 | Hard cut to the second window. Paste the link with `Pick up the work from this handback.link and tell me what I'm inheriting.` Show `read_handoff` fire. Let the answer play | The money shot. Different agent, different vendor, same link. It answers from structured data, not from prose it had to interpret. Do not rush this |
| 1:35–2:05 | `Resolve the pricing question and hand it back.` Show `stage_contribution` with `baseVersion` visible. Cut to the page: seal ticks v1→v2, hash changes, History gains a row. Then hold on the unchanged URL bar | Same link, new version. The still URL bar is what makes the claim visible rather than asserted |
| 2:05–2:30 | Agent calls `handback_settings` with `requireApproval: false`. Show the `human_only` refusal on screen. A human clicks Require approval. The next `stage_handoff` returns `staged_awaiting_human_approval` | The consent boundary. An agent can raise the bar and can never lower it. **Do not cut this beat** — it is what turns the auto-approve default from a liability into a design argument |
| 2:30–2:45 | Landing page, then a card: handback.link · github.com/BraedenBDev/handback · MIT | Five WebMCP tools. No account, free, MIT |

Film beats 4 and 6 first, while you are freshest. They carry the score.

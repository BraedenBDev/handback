# Dialogue Hero — Design Spec

## Summary

The CreatePage landing hero (`src/Hero.tsx`) has no object metaphor. A
scripted conversation plays out inside a floating browser-window frame: a
user asks for something, an agent does it, the user asks to save it, and the
agent hands back a real-shaped Handback link. The window then wipes, and a
second session opens knowing nothing, picks the work back up from that same
link, edits it, and hands it back. The window tilts with scroll and pointer
position, the closing link gets "clicked," the address bar flips to show the
live URL, then the scene clears and a different script starts. This is the
second replacement of the original hero concept; see History below.

The masthead mark and the WebGL connect-flash that fires once per page
mount are unchanged from the previous spec
(`docs/superpowers/specs/2026-08-29-usb-motif-and-connect.md`) and are only
summarized here for completeness — that spec's masthead-mark and
connect-flash sections remain the accurate description.

## The hero (`src/Hero.tsx`)

### Layout

`Hero` renders a `<section className="hero-stage">` containing:
- `.hero-copy` — an `<h2>` reading "Hand off the work.<br/>Get it back
  intact." and a `.sub` paragraph: "One encrypted link. Any agent opens it,
  adds to it, and hands it back, with every version kept."
- `.window-perspective` > `.window-orbit` > `.window-tilt` > `.window-object`
  — a nested transform stack. `.window-object` contains `.browser-stack`,
  which layers `.browser-edge` (an offset backing card, purely decorative)
  behind `.browser-card`, the actual window: a `.browser-chrome` bar with
  three `.browser-dot`s and a `.browser-url` pill, above a `.browser-screen`
  holding `.chat-stack`.
- `.window-ground` — a soft radial shadow beneath the window.

### The three scripts, two segments each

`Hero.tsx` defines `SCRIPTS: Script[]`, where
`Script = { provider: string; segments: Turn[][] }`. Three scripts, one per
provider the README names as unable to open each other's work: Claude,
ChatGPT, Gemini. The `provider` string is what the `.browser-url` pill shows
before a link resolves, so the window names a real agent rather than a
generic "new session."

Each script holds exactly two four-turn segments, alternating
`user` → `agent` → `user` → `agent`. Taking the Claude script as the
pattern:

Segment 1 (mint the link):
1. user: "Research dinosaurs for me."
2. agent: "Done. Three key eras, a shortlist of sources, one open question
   about feathered species."
3. user: "Save this to Handback."
4. agent: "Here's your link:" with `link: "handback.link/h/aB3xY9Qz…#••••••"`

The window then wipes (see `session-break` below).

Segment 2 (pick it back up):
1. user: "Pick up the research from this handback.link."
2. agent: "Loaded. Three key eras, one open question about feathered
   species."
3. user: "Add the asteroid impact timeline, then hand it back."
4. agent: "Added. Same link, new version." with the **same** `link` string as
   segment 1's closing turn.

**The wipe is load-bearing, not decoration.** Segment two is a different
session that starts knowing nothing, and the only thing crossing the gap is
the link. Playing both halves as one unbroken transcript would read as an
agent with memory, which is the opposite of the product's claim. The link
text being identical across the two segments is what makes "same link, new
version" checkable by eye rather than merely asserted.

There is no randomization; the component cycles strictly via
`scriptIndex % SCRIPTS.length`.

### Phase state machine

A `Phase` type — `"typing" | "session-break" | "clicking" | "clicked" |
"clearing"` — drives a `useEffect` that owns one `setTimeout` at a time.
State is `scriptIndex`, `segmentIndex`, `turnCount`, `phase`. The literal
timing constants from `Hero.tsx`:

```
TURN_DELAY_MS = 1150
FIRST_TURN_DELAY_MS = 600
CLICK_PAUSE_MS = 1000
CLICK_ANIM_MS = 220
HOLD_AFTER_CLICK_MS = 1400
CLEAR_MS = 350
HOLD_BEFORE_BREAK_MS = 1300
```

The sequence per script:
1. **typing**, `turnCount < segment.length`: reveal one more turn. First
   turn after `FIRST_TURN_DELAY_MS` (600ms), every subsequent turn after
   `TURN_DELAY_MS` (1150ms).
2. **typing**, segment finished, not the last segment: hold
   `HOLD_BEFORE_BREAK_MS` (1300ms) so the minted link registers, then move
   to `session-break`.
3. **session-break**: wait `CLEAR_MS` (350ms) while the screen fades, then
   advance `segmentIndex`, reset `turnCount` to 0, return to `typing`.
4. **typing**, last segment finished: wait `CLICK_PAUSE_MS` (1000ms), then
   move to `clicking`.
5. **clicking**: wait `CLICK_ANIM_MS` (220ms), then move to `clicked`.
6. **clicked**: wait `HOLD_AFTER_CLICK_MS` (1400ms), then move to
   `clearing`.
7. **clearing**: wait `CLEAR_MS` (350ms), then advance `scriptIndex`
   (wrapping via modulo), reset `segmentIndex` and `turnCount` to 0, return
   to `typing`.

One full script therefore runs roughly 10.7s. Under `prefers-reduced-motion:
reduce` the effect returns early, jumping straight to the final segment
fully revealed with `phase = "clicked"`.

### The click payoff

**Every turn of the current segment renders**, not just the revealed ones.
Unrevealed turns carry `visibility: hidden` (per `.chat-turn`) and gain
`.visible` as `turnCount` passes them. This reserves the segment's full
height from the first frame, so the window does not grow turn by turn and
shove the rest of the page down. `visibility: hidden` rather than
`opacity: 0` alone matters twice over: it reserves layout space, and it
keeps Playwright's `toBeVisible()` honest, since that checks
`visibility`/`display` but not opacity.

Each turn is a `.chat-turn` (`user` or `agent`, right- or left-aligned via
`justify-content`) wrapping a `.chat-bubble`. The closing turn of each
segment carries a `link`, rendered as a `.link-chip`. Only the final
segment's chip also gets `.link-chip-final`, and only that one gets the
`.clicking` class (a CSS `scale(0.94)`) while `phase === "clicking"` —
segment one's chip is shown, not yet proven. `.chat-stack` is keyed on
`` `${scriptIndex}-${segmentIndex}` `` so React remounts the turns on every
segment change instead of diffing one segment's bubbles into the next.

`linkLive` is `true` for phases `"clicked"` and `"clearing"`. The
`.browser-url` pill's text (`urlText`) is the script's `provider` name until
`linkLive`, at which point it swaps to the real link text (e.g.
`handback.link/h/aB3xY9Qz…#••••••`) and gains the `.is-live` class, which
recolors it to `var(--seal)` — this is the moment the address bar "proves
it's real." `wiping` is `true` for `"clearing"` and `"session-break"`, and
puts a `.clearing` class on `.browser-screen`, fading the screen to 0 for
both the mid-script session wipe and the end-of-script reset.

### Scroll and pointer transform

A separate `useEffect` (unrelated to the phase machine) drives one
continuous inline-style transform on `.window-tilt` and `.hero-copy`,
written directly via refs on every `requestAnimationFrame` tick rather
than through React state — the comment in the source is explicit that
re-rendering the tree on every scroll tick "would be wasteful and, worse,
laggy." It combines:
- `progress`, 0–1, from how far the `.hero-stage` bounding rect has
  scrolled past the top of the viewport (`-rect.top / rect.height`,
  clamped).
- Pointer position within the stage, normalized to roughly -0.5..0.5 on
  each axis, updated on `pointermove`/reset on `pointerleave`.

The tilt transform is `translateY(rise) scale(scale) rotateY(rotY)
rotateX(rotX)`, where `rotY = x*16 + progress*20`, `rotX = y*-10`,
`rise = progress*-90`, `scale = 1 - progress*0.2`. `.hero-copy` gets its
own `translateY(progress*-56px)` and fades via
`opacity = max(0, 1 - progress*1.7)`. Both listeners (`scroll` on
`window`, `pointermove`/`pointerleave` on the stage node) are registered
only when `prefers-reduced-motion` does not match `reduce`.

### Exit and unmount

An `IntersectionObserver` on the stage node calls the `onExit` prop once
the section's intersection ratio drops below 0.35 — i.e. once the user has
scrolled the hero mostly out of view. Both `CreatePage` and `HandoffPage`
use this to flip the masthead's `connect` prop (see below); `Hero` itself
does not unmount on this event, only on the page's own `showHero`
condition changing.

### Reduced motion

Inside the phase-machine effect, if
`window.matchMedia("(prefers-reduced-motion: reduce)").matches`, the
effect short-circuits: `turnCount` is set to `script.length` and `phase`
to `"clicked"` immediately, with no timers ever scheduled. This shows the
first script fully resolved — all four turns visible, link live — and
static; it never advances to a second script and never clears, since the
`clicked → clearing` transition timer is inside the branch that returns
early. The scroll/pointer effect is likewise skipped entirely for reduced
motion (the whole listener-registration block is behind the same
matchMedia check), so `.window-tilt` and `.hero-copy` never receive
inline transforms and sit at their CSS defaults.

CSS backs this up in `src/style.css`'s
`@media (prefers-reduced-motion: reduce)` block: `.window-orbit` and
`.window-ground` lose their idle-drift animation, `.chat-turn` transitions
to opacity-only with `transform: none !important`, and `.browser-screen`
/ `.link-chip` transitions are removed.

### CSS notes

`.window-object` is capped at `width: clamp(560px, 46vw, 880px)` with
`max-width: 92vw` as the narrow-viewport safety net (see Known Gaps — this
was read, not visually verified). `.window-orbit` runs a 10s
`window-drift` idle rotation independent of the scroll/pointer transform,
which lives one level down on `.window-tilt`. (The comment directly above
the hero's CSS block used to describe the prior browser-carousel hero —
fixed after this spec was drafted to describe the current dialogue script
instead.)

## Masthead mark and connect-flash (unchanged)

This subsystem was not touched by the hero rewrite and remains exactly as
the previous spec described it. Restated briefly, without contradicting
that spec on these points:

- `BrowserMark` (`src/ui.tsx`) renders the shared flat SVG mark via
  `<use href="#browser-mark" />`, sized `18` by default.
- `Masthead` places a `.mark-slot` (wrapping `BrowserMark`) before the
  `wordmark`, and accepts a `connect` prop. `useConnectSequence(active)`
  fires once per mount, guarded by `hasConnectedRef`: it adds
  `.mark-slot-arriving` to the slot, dynamically imports
  `src/connect-flash.ts`, and — unless `shouldSkipFlash()` (reduced motion
  or no WebGL) — calls `playConnectFlash(el, sealColor)` before removing
  the arriving class.
- `connect-flash.ts` is a small three.js module: an `OrthographicCamera`,
  one `PlaneGeometry` with an additive-blended `ShaderMaterial` (ring +
  glow fragment shader, `uProgress` driving both), rendered for a fixed
  `BURST_MS = 300` via `requestAnimationFrame`, then fully torn down
  (`material.dispose()`, `renderer.dispose()`, canvas removed) — no
  persistent render loop.
- On `CreatePage`, `Masthead connect={heroExited || created !== null}` —
  the flash fires once the hero's `IntersectionObserver` reports exit, or
  immediately if a handoff was already created. On `HandoffPage`,
  `Masthead connect` is passed unconditionally (always `true`) once the
  page reaches its decrypted-content render branch — the loading and
  expired/error branches render a bare `<Masthead />` with no `connect`
  prop.

## Content-card treatment

Everything below the masthead — on both `CreatePage` and `HandoffPage` —
sits inside a `<div className="content-card">`. Per `src/style.css`:
raised surface (`var(--paper-raised)`), `1px solid var(--rule-strong)`
border, `var(--radius)` corner radius, padding `2.25rem
clamp(1.25rem, 4vw, 2.75rem) 2.75rem`, a two-layer `box-shadow`, and
`margin-bottom: 3rem`. `.content-card > *:first-child` and `:last-child`
have their margins zeroed so the card's own padding is the only spacing at
its edges. Under `max-width: 46rem` the padding tightens to `1.5rem
1.15rem 2rem` and the radius switches to `var(--radius-inner)`.

On `CreatePage`, the `.content-card` wraps `ToolStatus`, `ApprovalMode`,
`ErrorNote`, the optional import notice, and then either the pending-draft
review section plus `StateView`, or `ManualDraftForm` — and separately,
in the `created` branch, wraps the `.reveal` link-delivery `Field`. `Hero`
itself renders outside and above the card, only when `showHero` (`!draft
&& !created`) is true. On `HandoffPage` the card wraps the same
`ToolStatus`/`ApprovalMode`/`ErrorNote` trio plus the seal-mismatch
warning, staged-contribution review, `StateView`, `HistoryView`, the
manual contribution form, and the "Take it with you" export `Field`. The
loading, expired, and no-doc early-return branches on `HandoffPage` render
outside any `.content-card` — just a bare `<Masthead />` and a `Field` or
paragraph directly in `<main>`.

## History

The hero has been rebuilt twice since the product's initial MVP. It began
as a CSS-only 3D USB-drive object (`3b0699a feat(create): add the hero
USB, shown only on a fresh visit`, and refined across several follow-up
commits), documented in the original
`docs/superpowers/specs/2026-08-29-usb-motif-and-connect.md`. That was
replaced with a floating browser window cycling through a carousel of
provider logos (`ab17c72 feat(create): browser window + provider carousel,
replacing the USB motif`, with further passes in `0f01046` and `20b5172`).
Both were dropped after real user feedback that they read as confusing —
neither a device nor a provider carousel clearly communicated what the
product does. The current scripted-dialogue hero landed in `b29c9df
feat(create): dialogue-driven hero, replacing the USB/carousel entirely`,
built around a conversation the visitor can actually read and understand
in a few seconds.

## Known Gaps

- **Narrow-viewport rendering not visually verified.** The `max-width:
  92vw` rule on `.window-object` (and the `clamp()` bounds on
  `.window-perspective`, `.browser-screen`, `.hero-copy h2`) was checked
  by reading `src/style.css` only. No live screenshot at a mobile or
  narrow-viewport size was taken this session — the browser-automation
  resize action did not take effect in this session, so the actual
  rendered layout at small widths (chat bubble wrapping, chrome-bar dot
  spacing, tilt transform at reduced scale) is unconfirmed.
- ~~**E2E suite.**~~ Closed: `e2e/hero.spec.ts` (renamed from
  `usb-motif.spec.ts`, commit `b8a9b81`) fixes the stale `#usb-mark`
  assertion and adds a real test that waits for the first scripted turn,
  then asserts `.link-chip` and `.browser-url` both resolve to a
  `handback.link/h/…`-shaped URL within the actual timing budget. All 4
  tests pass (`npx playwright test hero`).

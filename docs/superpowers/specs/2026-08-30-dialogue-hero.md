# Dialogue Hero — Design Spec

## Summary

The CreatePage landing hero (`src/Hero.tsx`) has no object metaphor. It is a
scripted two-turn conversation — a user asking for something, an agent
doing it, the user asking to save it, the agent handing back a real-shaped
Handback link — playing out inside a floating browser-window frame. The
window tilts with scroll and pointer position, the link gets "clicked," the
address bar flips to show the live URL, then the whole scene clears and a
different short script starts. This is the second replacement of the
original hero concept; see History below.

The masthead mark and the WebGL connect-flash that fires once per page
mount are unchanged from the previous spec
(`docs/superpowers/specs/2026-08-29-usb-motif-and-connect.md`) and are only
summarized here for completeness — that spec's masthead-mark and
connect-flash sections remain the accurate description.

## The hero (`src/Hero.tsx`)

### Layout

`Hero` renders a `<section className="hero-stage">` containing:
- `.hero-copy` — an `<h2>` reading "Hand off the work.<br/>Get it back
  intact." and a `.sub` paragraph: "A private link, not a paste. Move it,
  plug it in anywhere, get it back with everything that happened to it."
- `.window-perspective` > `.window-orbit` > `.window-tilt` > `.window-object`
  — a nested transform stack. `.window-object` contains `.browser-stack`,
  which layers `.browser-edge` (an offset backing card, purely decorative)
  behind `.browser-card`, the actual window: a `.browser-chrome` bar with
  three `.browser-dot`s and a `.browser-url` pill, above a `.browser-screen`
  holding `.chat-stack`.
- `.window-ground` — a soft radial shadow beneath the window.

### The two scripts

`Hero.tsx` defines `SCRIPTS: Turn[][]`, exactly two four-turn scripts, each
alternating `user` → `agent` → `user` → `agent`. Quoted verbatim from the
source:

Script 1:
1. user: "Research dinosaurs for me."
2. agent: "Done — three key eras, a shortlist of sources, and one open
   question about feathered species."
3. user: "Save this to Handback."
4. agent: "Here's your link:" with `link: "handback.link/h/aB3xY9Qz…#••••••"`

Script 2:
1. user: "Summarize this thread for the team."
2. agent: "Done — objective, decisions, and two open questions, written up."
3. user: "Save this to Handback."
4. agent: "Here's your link:" with `link: "handback.link/h/8k2NpQr7…#••••••"`

A code comment directly above `SCRIPTS` explains the intent: two short,
plausible tasks, "not the same demo every loop, so it reads as 'this works
for whatever you're doing' rather than 'this one demo.'" There is no third
script and no randomization — the component alternates strictly between
these two via `scriptIndex % SCRIPTS.length`.

### Phase state machine

A `Phase` type — `"typing" | "clicking" | "clicked" | "clearing"` — drives
a `useEffect` that owns one `setTimeout` at a time. The literal timing
constants from `Hero.tsx`:

```
TURN_DELAY_MS = 1300
FIRST_TURN_DELAY_MS = 600
CLICK_PAUSE_MS = 1000
CLICK_ANIM_MS = 220
HOLD_AFTER_CLICK_MS = 1600
CLEAR_MS = 350
```

The sequence per script:
1. **typing**, `turnCount < script.length`: reveal one more turn.
   First turn after `FIRST_TURN_DELAY_MS` (600ms), every subsequent turn
   after `TURN_DELAY_MS` (1300ms).
2. **typing**, all turns revealed: wait `CLICK_PAUSE_MS` (1000ms), then
   move to `clicking`.
3. **clicking**: wait `CLICK_ANIM_MS` (220ms), then move to `clicked`.
4. **clicked**: wait `HOLD_AFTER_CLICK_MS` (1600ms), then move to
   `clearing`.
5. **clearing**: wait `CLEAR_MS` (350ms), then advance `scriptIndex` to the
   next script (wrapping via modulo), reset `turnCount` to 0, and return to
   `typing`.

### The click payoff

`visibleTurns` is `script.slice(0, turnCount)` — only turns revealed so
far render into `.chat-stack`, each as a `.chat-turn` (`user` or `agent`,
right- or left-aligned via `justify-content`) wrapping a `.chat-bubble`.
The last turn of each script carries a `link`; when present it renders as
a `.link-chip` inside that bubble, which gets a `.clicking` class (a CSS
`scale(0.94)` per `.link-chip.clicking`) while `phase === "clicking"`.

`linkLive` is `true` for phases `"clicked"` and `"clearing"`. The
`.browser-url` pill's text (`urlText`) is `"new session"` until `linkLive`,
at which point it swaps to the script's real link text (e.g.
`handback.link/h/aB3xY9Qz…#••••••`) and gains the `.is-live` class, which
recolors it to `var(--seal)` — this is the moment the address bar "proves
it's real." During `"clearing"`, `.browser-screen` also gets a `.clearing`
class, which per CSS fades the whole screen's opacity to 0 as the scene
resets for the next script.

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

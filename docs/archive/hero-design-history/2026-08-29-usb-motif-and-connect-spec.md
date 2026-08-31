# USB Motif & Connect Sequence — Design Spec

> **Superseded 2026-08-30.** The hero object described below (CSS-only 3D
> USB, watermark, masthead mark) went through several more rounds after
> this spec and ended up somewhere different: no object metaphor at all —
> a scripted dialogue in a browser-window frame (see
> `docs/archive/hero-design-history/2026-08-30-dialogue-hero-spec.md`). The **masthead
> mark** and **connect-flash / `useConnectSequence`** sections below are
> still accurate — that subsystem survived the hero rewrites unchanged.
> Only the hero-object sections (the 3D face system, the USB-specific
> non-goals) describe code that no longer exists.

## Summary

handback.link gets a visual identity drawn from its own copy: the README
already calls the product "a USB stick." A CSS-only 3D drive is the
CreatePage hero. Everywhere else, the same outline recurs as a flat mark —
in both pages' shared `Masthead`, and as a faint watermark — never as a
mechanism performing app logic. The one deliberate exception: a single
"connect" moment, once per page visit, where the mark travels to the
masthead and a brief WebGL shader flash marks its arrival.

This spec supersedes the envelope concept (dropped) and the LED-as-state-
machine, eject-glyph, and drive-shaped-switch ideas explored and then
dropped during prototyping (`prototype/ui-design.html`, rev 2 → rev 3 in
that file's history). Those are documented here as explicit non-goals, not
silently forgotten.

## Decisions carried forward, unchanged

1. **Evolve the existing system, don't replace it.** No new hues, no new
   type. Everything below draws from `src/style.css`'s existing tokens
   (`--paper`, `--ink`, `--amber`, `--seal`, `--rule*`, `--radius*`,
   `--serif`, `--mono`).
2. **CSS-only 3D hero, zero new deps for the object itself.** The drive on
   CreatePage is built from absolutely-positioned `.face` divs under
   `perspective`/`preserve-3d`, exactly as validated in
   `prototype/ui-design.html` (`.usb-object`, `.f-*`, `.c-*`, `.usb-loop`,
   `.usb-label`, `.usb-led`, idle drift + pointer-tilt). Port this CSS
   verbatim; do not redesign the shape.
3. **The USB is a motif, not a mechanism.** Outside the hero and the one
   connect moment defined below, the object never performs literal device
   behavior. See Non-goals.

## What's new here: the connect sequence

One additional performative moment, scoped tightly on purpose:

- **CreatePage** — trigger: an `IntersectionObserver` on the new `Hero`
  section, firing when it crosses ~35% out of view scrolling down (the
  mechanism already validated in the prototype's `heroScroll`/`heroBadge`
  logic). This only exists in the pure-landing state — `draft === null &&
  created === null` — matching the earlier locked decision that the hero
  gets out of the way once you're doing real work.
- **HandoffPage** — trigger: the `loading → false` transition once `doc`
  is non-null — the moment decryption succeeds. "Connecting" here reads as
  what's actually happening: you're gaining access to this handoff's data.
  There is no scroll journey on this page; this is the "interaction"
  trigger for this page, not scroll.

Both funnel into the same destination: a small mark rendered inside the
shared `Masthead` component (`src/ui.tsx`), ahead of the wordmark. One
component, two trigger sites — not two parallel implementations.

### Motion

CSS-driven travel: the mark's container animates `transform` (translate +
scale) and `opacity` only, from its origin (hero center, or off-slot on
HandoffPage) to the masthead slot. New token:

```css
--arrive: 480ms cubic-bezier(0.23, 1, 0.32, 1);
```

(A tightened version of the prototype's 620ms recede — see audit above.)

### The shader flash

At arrival, a one-shot ~300ms burst: an additive-blended radial glow plus
a thin expanding ring, colored `--seal` (arrival/connection reads as
"committed," distinct from the ambient `--amber` LED already idling on the
hero object itself — that LED is part of the object's own surface detail
and is unaffected by any of this). Rendered in a small (~72×72 CSS px)
canvas absolutely positioned over the masthead mark slot.

**Fragment shader concept** (see Task 4 of the implementation plan for the
literal GLSL):

```glsl
uniform float uProgress; // 0 -> 1 over the burst
uniform vec3 uColor;

void main() {
  vec2 uv = vUv - 0.5;
  float dist = length(uv);
  float ring = 1.0 - smoothstep(0.0, 0.05, abs(dist - uProgress * 0.5));
  float glow = smoothstep(0.5, 0.0, dist) * (1.0 - uProgress);
  float alpha = clamp(ring + glow, 0.0, 1.0) * (1.0 - uProgress);
  gl_FragColor = vec4(uColor, alpha);
}
```

## Technical approach

- **Dependency:** `three` (core only) — the project's first non-React
  dependency (`package.json` currently lists only `react`/`react-dom`).
  No `@react-three/fiber`, no `drei`, no postprocessing package — one
  `ShaderMaterial` on one plane doesn't earn that abstraction.
- **Loaded via dynamic `import('three')`**, only at the moment a connect
  sequence is about to fire — not in the main bundle. A visitor who never
  scrolls past the hero, or a WebMCP agent driving the page headlessly,
  never pays for it.
- **One shared module**, `src/connect-flash.ts`, exporting
  `playConnectFlash(el: HTMLElement, colorHex: string): Promise<void>`,
  used by both trigger sites. It owns renderer creation, the burst's
  `requestAnimationFrame` loop, and teardown.
- **No persistent render loop.** The `rAF` loop runs only for the burst's
  ~300ms, then cancels. The canvas element can stay in the DOM (hidden via
  opacity 0) for reuse, or be removed — either way, GPU work stops.
- **Fallback / feature detection, checked *before* the dynamic import** (so
  the dependency is never fetched in these cases):
  - `prefers-reduced-motion: reduce` → skip travel + flash; the mark
    simply crossfades into the masthead slot via opacity only.
  - No WebGL (`!window.WebGLRenderingContext` or a failed context probe)
    → same plain crossfade fallback.

## Frequency & restraint (binding)

- The flash plays **once per page mount, ever**, guarded by a ref
  (`hasConnectedRef.current`). Re-crossing the CreatePage hero threshold
  by scrolling up and back down replays only the plain CSS travel, never
  the shader.
- Nothing else about the object regains functional behavior. No LED tied
  to busy/committed/error state, no eject glyph on the copy button, no
  drive-shaped switch knob. `ErrorNote`, the expired-handoff view, and
  `ApprovalMode`'s strip stay exactly as they are in the current app —
  untouched by this work, per the earlier "where the object stops"
  decision.
- The big hero itself (idle drift, pointer tilt, `AES · 256` label) is
  unchanged from the prototype.

## Non-goals

*(explicitly cut during prototyping — recorded so they aren't re-proposed)*

- No LED-as-state-machine (amber/blink/green tied to busy/committed/
  expiring across buttons and badges) — over-literal, cut in rev 3.
- No eject-glyph animation on the copy-link button — the real app's copy
  button (`CreatePage.tsx`, the `.reveal .link-row` button) already does a
  plain "Copy" → "Copied" text swap; leave it alone.
- No drive-shaped auto-approve switch knob — `ApprovalMode`'s toggle in
  `ui.tsx` is unchanged.
- No plug-in "seating" choreography as a first-open ceremony gated by
  `localStorage` — replaced by the load-triggered connect sequence above,
  which is simpler and ties to a real event (decrypt success) rather than
  a synthetic first-visit flag.
- No persistent 3D scene anywhere in the real app.
- No change to WebMCP tool behavior, encryption, retention, or any
  non-visual state.

## Files touched

- `src/style.css` — new tokens (`--arrive`, mark/watermark rules), hero
  section styles (ported from the prototype), masthead mark-slot styling.
- `src/ui.tsx` — new `UsbMark` component (the SVG symbol + `<use>`);
  `Masthead` gains an optional mark slot; new `useConnectSequence` hook.
- `src/CreatePage.tsx` — new `Hero` component, rendered only when
  `!draft && !created`; wires the `IntersectionObserver` trigger.
- `src/HandoffPage.tsx` — fires the connect sequence on the
  loading-to-content transition.
- New: `src/connect-flash.ts` — the Three.js shader module.
- `package.json` / `package-lock.json` — add `three`, `@types/three`
  (dev).

## Open questions / risks

- Exact placement of the masthead mark slot (before the wordmark? inline
  with `masthead-meta`?) should be checked against the live dev server —
  `Masthead`'s current layout is `wordmark` left, `masthead-meta` (Seal /
  expiry / Source link / theme toggle) right; the mark most likely sits
  immediately before the wordmark text, in the empty space to its left.
- `three`, even lazy-loaded, is real bytes (roughly 50–100kb gzip for the
  minimal paths used: `WebGLRenderer`, `Scene`, `PlaneGeometry`,
  `ShaderMaterial`, `Mesh`). Acceptable since it's deferred and off the
  critical path, but worth a bundle-size check post-implementation — this
  project already has a dedicated perf commit in its history (`perf: let
  the edge serve assets`), so a regression here should be caught, not
  assumed away.

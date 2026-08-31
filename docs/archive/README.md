# Archive

Pre-build planning, research, and design exploration — kept for the record,
not maintained. Everything here predates the shipped product and none of it
describes current behavior. For that, read the top-level [README](../../README.md),
[SECURITY.md](../../SECURITY.md), and the docs that remain in `docs/`.

## Product ideation

Three overlapping early passes at naming and positioning, before the product
was called Handback:

- [`PRODUCT-BRIEF.md`](PRODUCT-BRIEF.md) — the original product outcome and user story, under the working name "Agent USB."
- [`USP.md`](USP.md) — competitive framing and positioning language, same era.
- [`NAMING.md`](NAMING.md) + [`NAMING-LONG-LIST.md`](NAMING-LONG-LIST.md) — the naming exercise that landed on "Handback." The long list is the broader ranked search; `NAMING.md` is the shortlist with domain checks.
- [`sources-ledger.json`](sources-ledger.json) — the citation ledger the above docs reference.

## Pre-build technical specs

Three successive drafts of the WebMCP tool surface, written before any of it
was built. Each is more detailed than the last; none reflects the shipped
five-tool surface (`stage_handoff`, `get_handoff_receipt`, `read_handoff`,
`stage_contribution`, `handback_settings`) that `docs/WEBMCP-COMPATIBILITY.md`
and the README now describe:

- [`WEBMCP-RESEARCH-SNAPSHOT.md`](WEBMCP-RESEARCH-SNAPSHOT.md) — the earliest pass, dated 2026-08-26: a 3-tool design, before `handback_settings` or auto-approval existed.
- [`IMPLEMENTATION-SPEC.md`](IMPLEMENTATION-SPEC.md) — the settled pre-build MVP spec: boundaries, a 4-tool surface, an Express/SQLite stack that was never built (the shipped stack is a Cloudflare Worker + D1).
- [`WEBMCP-MVP.md`](WEBMCP-MVP.md) — the fullest pre-build spec, with literal tool-registration code and a 3-minute demo script.

## Hero design history

The landing-page hero (`src/Hero.tsx`) was built three times. These specs
document the first two attempts and why they were replaced; the current
design has no written spec of its own beyond the component's own comments.

- [`2026-08-29-usb-motif-and-connect-spec.md`](hero-design-history/2026-08-29-usb-motif-and-connect-spec.md) + [`-plan.md`](hero-design-history/2026-08-29-usb-motif-and-connect-plan.md) — attempt one, a CSS-only 3D USB-drive object. Superseded, except the masthead-mark and connect-flash subsystem it also introduced, which shipped unchanged and is still live in `src/ui.tsx` / `src/connect-flash.ts`.
- [`2026-08-30-dialogue-hero-spec.md`](hero-design-history/2026-08-30-dialogue-hero-spec.md) — attempt two, a floating-browser-window carousel, replaced before shipping by the current scripted-dialogue hero (see its own "History" section for the full lineage).

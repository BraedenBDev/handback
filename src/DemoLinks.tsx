import { useEffect, useRef, useState } from "react";
import type { HandoffDocument } from "../shared/schema.ts";
import { HistoryView, Seal, StateView } from "./ui.tsx";

/**
 * Three fabricated HandoffDocuments, real shape, real components (StateView/
 * Seal/HistoryView — the same ones a real handoff renders with), fake
 * content. No network call, no real /h/<id> link: this is a demo you can
 * open from the homepage, not a live handoff pretending to be one.
 */
const DEMOS: { id: string; title: string; doc: HandoffDocument }[] = [
  {
    id: "migration",
    title: "Postgres → Neon cutover",
    doc: {
      version: 3,
      createdAt: "2026-08-25T09:10:00Z",
      updatedAt: "2026-08-28T14:32:00Z",
      contentHash: "a91f3c02b7e4d891",
      parentHash: "5e0d18f4",
      state: {
        objective:
          "Move production Postgres off the self-hosted box onto Neon before the Oct 1 storage renewal, with zero data loss and under five minutes of write downtime.",
        summary:
          "Schema diff and seed copy are done and verified against row counts. The cutover script is written but not yet run against a staging clone — that's the last gate before we pick a maintenance window.",
        decisions: [
          {
            decision: "Dual-write during the cutover window",
            rationale: "Lets us verify row counts match before flipping the connection string, instead of trusting a single pg_dump pass.",
          },
          {
            decision: "Keep the old box running for 14 days",
            rationale: "Neon's point-in-time recovery only reaches back 7 days on our plan — a live fallback covers the gap.",
          },
        ],
        tasks: [
          { title: "Schema diff", status: "done" },
          { title: "Seed data copy", status: "done" },
          { title: "Cutover script", status: "in_progress" },
          { title: "DNS + pooler swap", status: "todo" },
          { title: "Old box decommission", status: "todo" },
        ],
        openQuestions: [
          "Does the reporting replica need its own migration path, or can it just re-point after cutover?",
          "Who owns notifying the two external services that poll the database directly?",
        ],
      },
      history: [
        {
          version: 3,
          note: "Cutover script drafted; dual-write decision added after a row-count mismatch in the first dry run.",
          operations: [],
          approvedAt: "2026-08-28T14:32:00Z",
        },
        {
          version: 2,
          note: "Seed data copy finished and verified against production row counts.",
          operations: [],
          approvedAt: "2026-08-27T11:05:00Z",
        },
        {
          version: 1,
          note: "Initial schema diff generated from the two databases.",
          operations: [],
          approvedAt: "2026-08-25T09:10:00Z",
        },
      ],
    },
  },
  {
    id: "design-review",
    title: "Checkout redesign review",
    doc: {
      version: 5,
      createdAt: "2026-08-24T10:00:00Z",
      updatedAt: "2026-08-29T16:48:00Z",
      contentHash: "2d88b0f19a3c5e77",
      parentHash: "914bb2a0",
      state: {
        objective:
          "Get sign-off on the redesigned one-page checkout before it ships to 10% of traffic on Monday — specifically the address autofill and the guest-checkout default.",
        summary:
          "Wireframes and copy are approved. The accessibility audit came back with two contrast issues on the error states, both since fixed. Waiting on the stakeholder review scheduled for tomorrow morning.",
        decisions: [
          {
            decision: "Default to guest checkout",
            rationale: "The account-creation prompt was costing about 4% of completions in the A/B test, per the analytics ticket.",
          },
          {
            decision: "Drop the two-step shipping/billing split",
            rationale: "A single combined form tested faster on mobile without raising the error rate.",
          },
        ],
        tasks: [
          { title: "Wireframes approved", status: "done" },
          { title: "Copy pass", status: "done" },
          { title: "Accessibility audit", status: "done" },
          { title: "Analytics events wired", status: "in_progress" },
          { title: "Stakeholder sign-off", status: "todo" },
        ],
        openQuestions: [
          "Does legal need to re-review the terms checkbox now that it moved below the fold?",
          "Is saved-card autofill in scope for this pass, or does it wait for the next one?",
        ],
      },
      history: [
        {
          version: 5,
          note: "Accessibility contrast fixes merged; both flagged states now pass.",
          operations: [],
          approvedAt: "2026-08-29T16:48:00Z",
        },
        {
          version: 4,
          note: "Copy pass approved after the second round of edits to the error messaging.",
          operations: [],
          approvedAt: "2026-08-28T09:22:00Z",
        },
        {
          version: 3,
          note: "First wireframe draft shared for early feedback.",
          operations: [],
          approvedAt: "2026-08-25T13:00:00Z",
        },
      ],
    },
  },
  {
    id: "postmortem",
    title: "Friday outage postmortem",
    doc: {
      version: 2,
      createdAt: "2026-08-28T22:05:00Z",
      updatedAt: "2026-08-29T01:40:00Z",
      contentHash: "f14a09c3e6b28d10",
      parentHash: "6bb471d2",
      state: {
        objective: "Write up what took checkout down for 22 minutes on Friday and land the follow-ups before the details get fuzzy.",
        summary:
          "Root cause is confirmed and the immediate fix is live. What's left is the alert-threshold change and the runbook update, so the next on-call catches this faster.",
        decisions: [
          {
            decision: "Root cause: connection pool exhaustion",
            rationale: "A retry loop in the payment webhook handler kept opening new connections without releasing the failed ones.",
          },
          {
            decision: "Patch forward, no rollback",
            rationale: "The fix was a pool-size and timeout config change, not a code revert — rolling back would have undone unrelated fixes too.",
          },
        ],
        tasks: [
          { title: "Timeline reconstructed", status: "done" },
          { title: "Root cause confirmed", status: "done" },
          { title: "Pool config patched", status: "done" },
          { title: "Alert threshold lowered", status: "in_progress" },
          { title: "Runbook updated", status: "todo" },
        ],
        openQuestions: [
          "Should the retry loop get a circuit breaker, or is the pool fix enough by itself?",
          "Does this need a customer-facing status note given it stayed under our SLA threshold?",
        ],
      },
      history: [
        {
          version: 2,
          note: "Root cause confirmed; pool exhaustion traced to the payment webhook retry loop.",
          operations: [],
          approvedAt: "2026-08-29T01:40:00Z",
        },
        {
          version: 1,
          note: "Postmortem doc opened right after the incident channel was closed out.",
          operations: [],
          approvedAt: "2026-08-28T22:05:00Z",
        },
      ],
    },
  },
];

export function DemoLinks() {
  const [openId, setOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const open = DEMOS.find((d) => d.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeydown);
      lastFocused.current?.focus?.();
    };
  }, [open]);

  return (
    <section className="demo-links">
      <h2>See what a handback link actually looks like</h2>
      <p className="sub">Three example handoffs, reusing the real product's own Field/Seal/History markup — click a card to open it.</p>

      <div className="demo-cards">
        {DEMOS.map((demo) => (
          <button
            type="button"
            className="demo-card"
            key={demo.id}
            aria-haspopup="dialog"
            onClick={() => setOpenId(demo.id)}
          >
            <span className="demo-card-eyebrow">Handback</span>
            <span className="demo-card-title">{demo.title}</span>
            <span className="demo-card-meta">
              v{demo.doc.version} · updated {new Date(demo.doc.updatedAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="demo-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpenId(null);
          }}
        >
          <div className="demo-panel" role="dialog" aria-modal="true" aria-label="Example handback link" tabIndex={-1} ref={panelRef}>
            <button type="button" className="demo-close" aria-label="Close example" onClick={() => setOpenId(null)}>
              &times;
            </button>
            <p className="demo-note">Example content — not a live link</p>
            <Seal version={open.doc.version} hash={open.doc.contentHash} />
            <StateView state={open.doc.state} />
            <HistoryView doc={open.doc} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

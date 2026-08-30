import { useState } from "react";

type Item = { heading: string; body: React.ReactNode };

const ITEMS: Item[] = [
  {
    heading: "How you start",
    body: (
      <>
        <p>You don't open a new app or fill out a form. You just tell whatever agent you're already talking to what to do with the conversation.</p>
        <div className="explainer-chip-list">
          <span className="explainer-chip">Hand this off to Handback</span>
          <span className="explainer-chip">Save this to Handback before we lose the thread</span>
          <span className="explainer-chip">Package this up in Handback for whoever's next</span>
        </div>
      </>
    ),
  },
  {
    heading: "It drafts, you review",
    body: (
      <p>
        Your agent doesn't hand over a wall of prose. It packages the current state — objective, decisions made, constraints, open tasks,
        unresolved questions — as structured data, and shows you the draft first. Nothing is saved yet.
      </p>
    ),
  },
  {
    heading: "The one link",
    body: (
      <>
        <span className="explainer-badge">Encrypted before it leaves your browser</span>
        <p>
          You approve, and your browser encrypts the content locally, before any of it leaves your machine. The decryption key lives only
          in the URL fragment — the part after the <code className="explainer-inline-code">#</code> — which browsers never transmit to a
          server. So the server only ever holds ciphertext it can't read. You get exactly one link.
        </p>
      </>
    ),
  },
  {
    heading: "Anyone can pick it up",
    body: (
      <p>
        Whoever opens that link points any agent at it — doesn't have to be the same one, or the same person. That agent reads the
        structured state directly. It's not reconstructing your objective from a pasted transcript; the objective is already there.
      </p>
    ),
  },
  {
    heading: "It keeps going",
    body: (
      <p>
        When the new agent has changes, it proposes them as a diff against the exact version it read. A human approves — the same gate as
        before, on both ends — and a new sealed version is created. That can repeat indefinitely, the same link accumulating versions
        across however many hops. Every version is kept, so reopening the link later shows exactly what happened while you were away.
      </p>
    ),
  },
];

const FLOW_STEPS = [
  { n: "01", label: "You ask", cx: 60 },
  { n: "02", label: "It drafts", cx: 210 },
  { n: "03", label: "One link", cx: 360 },
  { n: "04", label: "They open it", cx: 510 },
  { n: "05", label: "It continues", cx: 660 },
];

/**
 * Purely decorative: the same five-step sequence is already real,
 * accessible content in the headings below (and their expandable detail),
 * so this stays out of the accessibility tree rather than making a screen
 * reader hear a terser version of what's coming up right after it.
 */
function ExplainerFlow() {
  return (
    <div className="explainer-flow" aria-hidden="true">
      <svg className="explainer-flow-svg" viewBox="0 0 720 150" focusable="false">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" className="explainer-flow-arrowhead" />
          </marker>
          <marker id="flow-arrow-loop" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" className="explainer-flow-loop-head" />
          </marker>
        </defs>

        <path d="M80 40 H190" className="explainer-flow-line" markerEnd="url(#flow-arrow)" />
        <path d="M230 40 H340" className="explainer-flow-line" markerEnd="url(#flow-arrow)" />
        <path d="M380 40 H490" className="explainer-flow-line" markerEnd="url(#flow-arrow)" />
        <path d="M530 40 H640" className="explainer-flow-line" markerEnd="url(#flow-arrow)" />

        <text x="135" y="28" textAnchor="middle" className="explainer-flow-arrow-label">tell your agent</text>
        <text x="285" y="28" textAnchor="middle" className="explainer-flow-arrow-label">you approve</text>
        <text x="435" y="28" textAnchor="middle" className="explainer-flow-arrow-label">share the link</text>
        <text x="585" y="28" textAnchor="middle" className="explainer-flow-arrow-label">picks it up</text>

        <path d="M660 60 C 660 120, 360 120, 360 60" className="explainer-flow-loop" markerEnd="url(#flow-arrow-loop)" />
        <text x="510" y="138" textAnchor="middle" className="explainer-flow-loop-label">new version, same link</text>

        {FLOW_STEPS.map((step) => (
          <g key={step.n}>
            <circle cx={step.cx} cy="40" r="20" className={step.n === "03" ? "explainer-flow-node is-hub" : "explainer-flow-node"} />
            <text x={step.cx} y="45" textAnchor="middle" className="explainer-flow-node-number">{step.n}</text>
            <text x={step.cx} y="78" textAnchor="middle" className="explainer-flow-node-label">{step.label}</text>
          </g>
        ))}
      </svg>

      <ol className="explainer-flow-mobile">
        {FLOW_STEPS.map((step) => (
          <li key={step.n} className="explainer-flow-mobile-step">
            <span className="explainer-flow-mobile-n">{step.n}</span>
            <span>{step.label}</span>
          </li>
        ))}
        <li className="explainer-flow-mobile-loop">↺ new version, same link</li>
      </ol>
    </div>
  );
}

export function Explainer() {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section className="explainer-section" aria-labelledby="explainer-heading">
      <h2 className="explainer-title" id="explainer-heading">
        How it actually works
      </h2>

      <ExplainerFlow />

      <div className="explainer-list">
        {ITEMS.map((item, index) => {
          const isOpen = openIndexes.has(index);
          const headerId = `explainer-header-${index}`;
          const panelId = `explainer-panel-${index}`;
          return (
            <div className="explainer-item" key={item.heading}>
              <h3 className="explainer-item-heading">
                <button
                  type="button"
                  className="explainer-header"
                  id={headerId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(index)}
                >
                  <span className="explainer-index" aria-hidden="true" />
                  <span className="explainer-header-text">{item.heading}</span>
                  <svg className="explainer-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </h3>
              <div
                className={`explainer-panel${isOpen ? " is-open" : ""}`}
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                aria-hidden={!isOpen}
              >
                <div className="explainer-panel-inner">{item.body}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="explainer-footnote">
        Links expire on a window you choose — <span className="explainer-footnote-values">24h / 7d / 30d / never</span> — and the clock
        resets on every new version. Download the whole thing as a file at any point, so the work survives even if this service doesn't.
      </p>
    </section>
  );
}

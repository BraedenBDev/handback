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
      <p className="explainer-eyebrow">The mechanism</p>
      <h2 className="explainer-title" id="explainer-heading">
        How it actually works
      </h2>

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

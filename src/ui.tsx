import { useEffect, useState } from "react";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";
import { sealOf, type SealVerdict } from "./hash.ts";

/**
 * Presentational pieces.
 *
 * Everything here renders agent-supplied strings as JSX text children, which
 * React escapes. There is no dangerouslySetInnerHTML in this project and there
 * must never be one: a handoff carries text written by other people's agents.
 */

/** Label in the margin, content in the measure. The `index` drives the enter stagger. */
export function Field({
  label,
  index = 0,
  children,
}: {
  label: string;
  index?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="field" style={{ "--i": index } as React.CSSProperties}>
      <h3 className="field-label">{label}</h3>
      <div className="field-body">{children}</div>
    </section>
  );
}

/**
 * A version's short content hash. Real data, not decoration — and deliberately
 * modest about what it proves. It shows internal consistency, not authorship;
 * anyone holding the key could recompute a valid one.
 */
export function Seal({
  version,
  hash,
  verdict = "verified",
}: {
  version?: number;
  hash?: string | null;
  verdict?: SealVerdict;
}) {
  const title =
    verdict === "mismatch"
      ? "This version's contents do not match its recorded seal. It was changed outside the approval path."
      : verdict === "unsealed"
        ? "Created before seals existed, so there is nothing to check against."
        : "Contents match the recorded seal.";
  return (
    <span className="seal" data-verdict={verdict} title={title}>
      <span className="seal-dot" aria-hidden="true" />
      {version !== undefined ? <span className="seal-version">v{version}</span> : null}
      <span>{sealOf(hash)}</span>
      <span className="visually-hidden">
        {verdict === "mismatch" ? ", seal does not match" : verdict === "unsealed" ? ", unsealed" : ", seal verified"}
      </span>
    </span>
  );
}

export function Masthead({ children }: { children?: React.ReactNode }) {
  return (
    <header className="masthead">
      <h1 className="wordmark">
        Handback
        <span className="wordmark-sub">Hand off the work. Get it back intact.</span>
      </h1>
      <div className="masthead-meta">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("handback-theme");
    } catch {
      // Private windows and blocked site data throw on access, not just on read.
    }
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
    }
  }, []);

  function choose(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("handback-theme", next);
    } catch {
      // A theme that does not persist is still a theme that works this visit.
    }
  }

  const showing = theme ?? (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => choose(showing === "dark" ? "light" : "dark")}
      aria-label={`Switch to ${showing === "dark" ? "light" : "dark"} theme`}
    >
      {showing === "dark" ? "Light" : "Dark"}
    </button>
  );
}

export function StateView({ state, from = 0 }: { state: HandoffState; from?: number }) {
  let index = from;
  const next = () => index++;
  return (
    <div className="record">
      <Field label="Objective" index={next()}>
        <p className="lede">{state.objective}</p>
      </Field>

      <Field label="Where this stands" index={next()}>
        <p>{state.summary}</p>
      </Field>

      {state.decisions?.length ? (
        <Field label="Decisions" index={next()}>
          <ul className="entries">
            {state.decisions.map((item, i) => (
              <li key={i}>
                <span className="entry-title">{item.decision}</span>
                {item.rationale ? <div className="entry-why">{item.rationale}</div> : null}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      {state.constraints?.length ? (
        <Field label="Constraints" index={next()}>
          <ul className="entries">
            {state.constraints.map((item, i) => (
              <li key={i}>
                <span className="tag">{item.kind.replace("_", " ")}</span> {item.text}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      {state.tasks?.length ? (
        <Field label="Tasks" index={next()}>
          <ul className="tasks">
            {state.tasks.map((task, i) => (
              <li key={i}>
                <span className={`status status-${task.status}`}>{task.status.replace("_", " ")}</span>
                <span className={task.status === "done" ? "task-done" : undefined}>{task.title}</span>
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      {state.openQuestions?.length ? (
        <Field label="Open questions" index={next()}>
          <ul className="plain">
            {state.openQuestions.map((question, i) => (
              <li key={i}>{question}</li>
            ))}
          </ul>
        </Field>
      ) : null}

      {state.sources?.length ? (
        <Field label="Sources" index={next()}>
          <ul className="plain">
            {state.sources.map((source, i) => (
              <li key={i}>
                {/* noreferrer matters: the fragment key must never leak via Referer. */}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      {state.handoffNote ? (
        <Field label="Note to next" index={next()}>
          <p>{state.handoffNote}</p>
        </Field>
      ) : null}
    </div>
  );
}

export function HistoryView({ doc }: { doc: HandoffDocument }) {
  if (!doc.history.length) return null;
  return (
    <Field label="History" index={9}>
      <ul className="history">
        {doc.history.map((entry) => (
          <li key={entry.version}>
            <span className="history-when">v{entry.version}</span>
            <span>
              {entry.note}
              <div className="history-when">{new Date(entry.approvedAt).toLocaleString()}</div>
            </span>
          </li>
        ))}
      </ul>
    </Field>
  );
}

export function ToolStatus({ available }: { available: boolean }) {
  return (
    <div className={`strip ${available ? "strip-on" : "strip-off"}`}>
      {available ? (
        <>
          <b>WebMCP tools registered.</b>
          <span>Ask your agent to hand this work off.</span>
        </>
      ) : (
        <>
          <b>WebMCP not detected.</b>
          <span>
            Use Chrome 149+ with <code>chrome://flags/#enable-webmcp-testing</code>, or fill in the form below.
          </span>
        </>
      )}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}

import { useEffect, useRef, useState } from "react";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";
import { sealOf, type SealVerdict } from "./hash.ts";
import { readAutoApprove, writeAutoApprove } from "./auto-approve.ts";

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

export const REPOSITORY_URL = "https://github.com/BraedenBDev/handback";

/** The GitHub mark, inline. No emoji: they render inconsistently and read as decoration. */
function SourceMark() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.36-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.19c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}

/** The shared flat mark, recurring in both pages' masthead — same shape as the hero. */
export function BrowserMark({ size = 18 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={(size * 22) / 28} aria-hidden="true">
      <use href="#browser-mark" />
    </svg>
  );
}

/** Fires the connect flash into the returned slot ref, once ever per mount. */
export function useConnectSequence(active: boolean) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    if (!active || hasConnectedRef.current || !slotRef.current) return;
    hasConnectedRef.current = true;
    const el = slotRef.current;
    el.classList.add("mark-slot-arriving");
    const finish = () => el.classList.remove("mark-slot-arriving");

    (async () => {
      const { shouldSkipFlash, playConnectFlash } = await import("./connect-flash.ts");
      if (shouldSkipFlash()) {
        finish();
        return;
      }
      const sealColor = getComputedStyle(document.documentElement).getPropertyValue("--seal").trim() || "#2C5647";
      await playConnectFlash(el, sealColor);
      finish();
    })();
  }, [active]);

  return slotRef;
}

export function Masthead({ children, connect = false }: { children?: React.ReactNode; connect?: boolean }) {
  const markSlotRef = useConnectSequence(connect);
  return (
    <header className="masthead">
      <div className="masthead-title">
        <span className="mark-slot" ref={markSlotRef}>
          <BrowserMark />
        </span>
        <h1 className="wordmark">
          Handback
          <span className="wordmark-sub">Hand off the work. Get it back intact.</span>
        </h1>
      </div>
      <div className="masthead-meta">
        {children}
        <a className="source-link" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          <SourceMark />
          Source
        </a>
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
            Use the ChatGPT desktop app's built-in browser with Site tools on, or Chrome 149+ with{" "}
            <code>chrome://flags/#enable-webmcp-testing</code>. You can still use Handback by hand below.
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The consent mode, always visible so nobody is unsure which one they are in.
 * Off by default; the switch is the human's single deliberate act of consent,
 * after which this device stops asking per operation.
 */
export function ApprovalMode({ onChange }: { onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(readAutoApprove);

  function toggle() {
    const next = !on;
    setOn(next);
    writeAutoApprove(next);
    onChange?.(next);
  }

  return (
    <div className={`strip ${on ? "strip-auto" : "strip-gate"}`}>
      <b>{on ? "Auto-approving." : "Approval required."}</b>
      <span>
        {on
          ? "Your agent creates and commits on this device without asking. Every version is still kept, so anything it writes can be read back."
          : "Your agent stages; you click to commit."}
      </span>
      <button type="button" className="mode-toggle" onClick={toggle} aria-pressed={on}>
        {on ? "Require approval" : "Stop asking on this device"}
      </button>
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

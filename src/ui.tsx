import type { HandoffDocument, HandoffState } from "../shared/schema.ts";

/**
 * Presentational pieces. Everything here renders agent-supplied strings as JSX
 * text children, which React escapes. There is no dangerouslySetInnerHTML in
 * this project and there should never be one: the whole point is that a
 * handoff carries text written by other people's agents.
 */

export function UntrustedBadge() {
  return (
    <span className="badge" title="This content came from another agent or person. Review it before acting on it.">
      unverified content
    </span>
  );
}

export function StateView({ state }: { state: HandoffState }) {
  return (
    <div className="state">
      <section>
        <h3>Objective</h3>
        <p>{state.objective}</p>
      </section>

      <section>
        <h3>Where this stands</h3>
        <p className="summary">{state.summary}</p>
      </section>

      {state.decisions?.length ? (
        <section>
          <h3>Decisions</h3>
          <ul>
            {state.decisions.map((item, index) => (
              <li key={index}>
                <strong>{item.decision}</strong>
                {item.rationale ? <span className="muted"> — {item.rationale}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.constraints?.length ? (
        <section>
          <h3>Constraints</h3>
          <ul>
            {state.constraints.map((item, index) => (
              <li key={index}>
                <code>{item.kind}</code> {item.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.tasks?.length ? (
        <section>
          <h3>Tasks</h3>
          <ul className="tasks">
            {state.tasks.map((task, index) => (
              <li key={index}>
                <span className={`status status-${task.status}`}>{task.status.replace("_", " ")}</span>
                {task.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.openQuestions?.length ? (
        <section>
          <h3>Open questions</h3>
          <ul>
            {state.openQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.sources?.length ? (
        <section>
          <h3>Sources</h3>
          <ul>
            {state.sources.map((source, index) => (
              <li key={index}>
                {/* rel=noreferrer matters: the fragment key must never leak via Referer */}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.handoffNote ? (
        <section>
          <h3>Note to whoever picks this up</h3>
          <p>{state.handoffNote}</p>
        </section>
      ) : null}
    </div>
  );
}

export function HistoryView({ doc }: { doc: HandoffDocument }) {
  if (!doc.history.length) return null;
  return (
    <section className="history">
      <h3>History</h3>
      <ol>
        {doc.history.map((entry) => (
          <li key={entry.version}>
            <strong>v{entry.version}</strong> {entry.note}{" "}
            <span className="muted">{new Date(entry.approvedAt).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ToolStatus({ available }: { available: boolean }) {
  return (
    <div className={`tools ${available ? "tools-on" : "tools-off"}`}>
      {available ? (
        <>
          <strong>WebMCP tools registered.</strong> Ask your agent to hand this work off.
        </>
      ) : (
        <>
          <strong>WebMCP not detected.</strong> Use Chrome 149+ with{" "}
          <code>chrome://flags/#enable-webmcp-testing</code>, or fill the form below by hand.
        </>
      )}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="error">{error}</p>;
}

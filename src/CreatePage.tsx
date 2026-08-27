import { useEffect, useRef, useState } from "react";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";
import { buildHandoffUrl, encryptDocument, exportKey, generateKey } from "./crypto.ts";
import { createHandoff } from "./api.ts";
import { isWebMcpAvailable, registerHandbackTools, type WebMcpBridge } from "./webmcp.ts";
import { ErrorNote, StateView, ToolStatus, UntrustedBadge } from "./ui.tsx";

export function CreatePage() {
  const [draft, setDraft] = useState<HandoffState | null>(null);
  const [created, setCreated] = useState<{ url: string; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webMcp] = useState(isWebMcpAvailable);

  // The tools read live state through a ref so registration happens once per
  // document (re-registering a name throws) while still seeing current values.
  const latest = useRef({ created });
  latest.current = { created };

  useEffect(() => {
    const bridge: WebMcpBridge = {
      stageHandoff: (state) => {
        setError(null);
        setCreated(null);
        setDraft(state);
      },
      getReceipt: () =>
        latest.current.created
          ? { status: "created", url: latest.current.created.url, version: latest.current.created.version }
          : { status: "pending" },
      readHandoff: () => ({ error: "No handoff is open on this page. Open a handoff link to read one." }),
      stageContribution: () => {
        throw new Error("No handoff is open on this page. Open a handoff link to contribute to one.");
      },
    };
    let controller: AbortController | null = null;
    registerHandbackTools(bridge).then((result) => (controller = result));
    return () => controller?.abort();
  }, []);

  async function approveAndCreate() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const doc: HandoffDocument = { state: draft, version: 1, createdAt: now, updatedAt: now, history: [] };

      // The key is generated exactly once, here. It goes into the URL fragment
      // and is never regenerated for later versions.
      const key = await generateKey();
      const envelope = await encryptDocument(key, doc);
      const { id, version } = await createHandoff(envelope);
      const url = buildHandoffUrl(location.origin, id, await exportKey(key));
      setCreated({ url, version });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the handoff.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <main>
        <h1>Handback</h1>
        <h2>Your link</h2>
        <p className="muted">
          The key after the <code>#</code> never reaches the server. Anyone with the whole link can read this handoff,
          so treat it like a password.
        </p>
        <input className="link" readOnly value={created.url} onFocus={(event) => event.target.select()} />
        <p>
          <button onClick={() => navigator.clipboard?.writeText(created.url)}>Copy link</button>{" "}
          <a href={created.url}>Open it</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Handback</h1>
      <p className="tagline">Hand off the work. Get it back intact.</p>
      <ToolStatus available={webMcp} />
      <ErrorNote error={error} />

      {draft ? (
        <>
          <h2>
            Review this handoff <UntrustedBadge />
          </h2>
          <p className="muted">Your agent staged this. Nothing has been saved or shared yet.</p>
          <StateView state={draft} />
          <div className="actions">
            <button className="primary" onClick={approveAndCreate} disabled={busy}>
              {busy ? "Encrypting…" : "Approve and create"}
            </button>
            <button onClick={() => setDraft(null)} disabled={busy}>
              Discard
            </button>
          </div>
        </>
      ) : (
        <ManualDraftForm onStage={setDraft} />
      )}
    </main>
  );
}

/** Fallback for browsers without WebMCP, and for anyone who prefers typing. */
function ManualDraftForm({ onStage }: { onStage: (state: HandoffState) => void }) {
  const [objective, setObjective] = useState("");
  const [summary, setSummary] = useState("");
  const [handoffNote, setHandoffNote] = useState("");

  return (
    <form
      className="manual"
      onSubmit={(event) => {
        event.preventDefault();
        onStage({ objective, summary, handoffNote: handoffNote || undefined });
      }}
    >
      <h2>Or write it yourself</h2>
      <label>
        Objective
        <input required value={objective} onChange={(event) => setObjective(event.target.value)} />
      </label>
      <label>
        Where the work stands
        <textarea required rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label>
        Note to whoever picks this up
        <textarea rows={3} value={handoffNote} onChange={(event) => setHandoffNote(event.target.value)} />
      </label>
      <button type="submit">Stage handoff</button>
    </form>
  );
}

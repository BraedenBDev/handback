import { useEffect, useRef, useState } from "react";
import type { Contribution, HandoffDocument, ReadSection } from "../shared/schema.ts";
import { decryptDocument, encryptDocument, importKey, readKeyFromFragment } from "./crypto.ts";
import { fetchHandoff, updateHandoff, VersionConflictError } from "./api.ts";
import { applyContribution, describeContribution, StaleBaseError } from "./contribution.ts";
import { downloadFile, toMarkdown, toPortableJson } from "./export.ts";
import { isWebMcpAvailable, registerHandbackTools, type WebMcpBridge } from "./webmcp.ts";
import { ErrorNote, HistoryView, StateView, ToolStatus, UntrustedBadge } from "./ui.tsx";

export function HandoffPage({ id }: { id: string }) {
  const [doc, setDoc] = useState<HandoffDocument | null>(null);
  const [staged, setStaged] = useState<Contribution | null>(null);
  const [status, setStatus] = useState<string>("Decrypting…");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webMcp] = useState(isWebMcpAvailable);

  // The content key, imported once from the fragment and reused for every
  // later write. Regenerating it on update would invalidate the link the user
  // already handed out — the exact bug that sank the first implementation.
  const keyRef = useRef<CryptoKey | null>(null);
  const latest = useRef<{ doc: HandoffDocument | null }>({ doc: null });
  latest.current = { doc };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const encoded = readKeyFromFragment(location.hash);
        if (!encoded) throw new Error("This link is missing its key. Copy the whole link, including the part after #.");
        const key = await importKey(encoded);
        keyRef.current = key;
        const stored = await fetchHandoff(id);
        const decrypted = await decryptDocument(key, stored.envelope);
        if (cancelled) return;
        setDoc(decrypted);
        setStatus("");
      } catch (cause) {
        if (cancelled) return;
        setStatus("");
        setError(
          cause instanceof Error && cause.name === "OperationError"
            ? "That key does not decrypt this handoff. The link may be truncated or from a different handoff."
            : cause instanceof Error
              ? cause.message
              : "Could not open this handoff.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const bridge: WebMcpBridge = {
      stageHandoff: () => {
        throw new Error("A handoff is already open here. Use stage_contribution to propose changes to it.");
      },
      getReceipt: () => {
        const current = latest.current.doc;
        return current ? { status: "created", url: location.href, version: current.version } : { status: "pending" };
      },
      readHandoff: (sections: ReadSection[]) => {
        const current = latest.current.doc;
        if (!current) return { error: "This handoff has not finished decrypting yet." };
        const picked: Record<string, unknown> = { version: current.version };
        for (const section of sections) picked[section] = current.state[section] ?? null;
        return picked;
      },
      stageContribution: (contribution: Contribution) => {
        const current = latest.current.doc;
        if (!current) throw new Error("This handoff has not finished decrypting yet.");
        if (contribution.baseVersion !== current.version) {
          throw new StaleBaseError(contribution.baseVersion, current.version);
        }
        setError(null);
        setStaged(contribution);
        return { baseVersion: contribution.baseVersion, operationCount: contribution.operations.length };
      },
    };
    let controller: AbortController | null = null;
    registerHandbackTools(bridge).then((result) => (controller = result));
    return () => controller?.abort();
  }, []);

  async function approveContribution() {
    const key = keyRef.current;
    if (!doc || !staged || !key) return;
    setBusy(true);
    setError(null);
    try {
      const next = applyContribution(doc, staged);
      // Same key, new IV. The link the user shared keeps working.
      const envelope = await encryptDocument(key, next);
      await updateHandoff(id, envelope, doc.version);
      setDoc(next);
      setStaged(null);
    } catch (cause) {
      if (cause instanceof VersionConflictError) {
        setError(
          `Someone else saved a change first — this handoff is now at version ${cause.currentVersion}. Reload and ask your agent to propose again against the new version.`,
        );
      } else {
        setError(cause instanceof Error ? cause.message : "Could not save the contribution.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (status) return <main><p>{status}</p></main>;
  if (!doc) return <main><h1>Handback</h1><ErrorNote error={error} /></main>;

  return (
    <main>
      <h1>Handback</h1>
      <p className="tagline">
        Version {doc.version} · updated {new Date(doc.updatedAt).toLocaleString()}
      </p>
      <ToolStatus available={webMcp} />
      <ErrorNote error={error} />

      {staged ? (
        <section className="proposal">
          <h2>
            Proposed changes <UntrustedBadge />
          </h2>
          <p className="muted">{staged.note}</p>
          <ul className="diff">
            {describeContribution(staged).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <div className="actions">
            <button className="primary" onClick={approveContribution} disabled={busy}>
              {busy ? "Saving…" : "Approve contribution"}
            </button>
            <button onClick={() => setStaged(null)} disabled={busy}>
              Reject
            </button>
          </div>
        </section>
      ) : null}

      <StateView state={doc.state} />
      <HistoryView doc={doc} />

      {!staged ? <ManualContributionForm baseVersion={doc.version} onStage={setStaged} /> : null}

      <section className="exports">
        <h3>Take it with you</h3>
        <p className="muted">
          These files save to your own device in the clear, so you keep the work if this service disappears.
        </p>
        <button onClick={() => downloadFile(`handback-${id}.json`, toPortableJson(doc), "application/json")}>
          Download portable file
        </button>{" "}
        <button onClick={() => downloadFile(`handback-${id}.md`, toMarkdown(doc), "text/markdown")}>
          Download Markdown
        </button>
      </section>
    </main>
  );
}

/** Fallback contribution path. The first implementation shipped a fallback that
 *  could create a handoff but not contribute to one, which broke the whole
 *  round trip in any browser without WebMCP. */
function ManualContributionForm({
  baseVersion,
  onStage,
}: {
  baseVersion: number;
  onStage: (contribution: Contribution) => void;
}) {
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [op, setOp] = useState("add_decision");

  return (
    <form
      className="manual"
      onSubmit={(event) => {
        event.preventDefault();
        onStage({ baseVersion, note, operations: [{ op, value }] });
        setNote("");
        setValue("");
      }}
    >
      <h3>Propose a change yourself</h3>
      <label>
        What kind
        <select value={op} onChange={(event) => setOp(event.target.value)}>
          <option value="add_decision">Add a decision</option>
          <option value="add_task">Add a task</option>
          <option value="add_open_question">Add an open question</option>
          <option value="set_summary">Replace the summary</option>
        </select>
      </label>
      <label>
        Content
        <textarea required rows={3} value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <label>
        Why (shown to the reviewer)
        <input required value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="submit">Stage contribution</button>
    </form>
  );
}

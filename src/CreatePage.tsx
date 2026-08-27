import { useEffect, useRef, useState } from "react";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";
import { buildHandoffUrl, encryptDocument, exportKey, generateKey } from "./crypto.ts";
import { createHandoff } from "./api.ts";
import { stampDocument } from "./hash.ts";
import { ImportError, readPortableFile } from "./import.ts";
import { isWebMcpAvailable, registerHandbackTools, type WebMcpBridge } from "./webmcp.ts";
import { ErrorNote, Field, Masthead, Seal, StateView, ToolStatus } from "./ui.tsx";

export function CreatePage() {
  const [draft, setDraft] = useState<HandoffState | null>(null);
  const [created, setCreated] = useState<{ url: string; version: number; hash: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [webMcp, setWebMcp] = useState(isWebMcpAvailable);

  // The tools read live state through a ref so registration happens once per
  // document (re-registering a name throws) while still seeing current values.
  const latest = useRef({ created });
  latest.current = { created };

  useEffect(() => {
    const bridge: WebMcpBridge = {
      stageHandoff: (state) => {
        setError(null);
        setNotice(null);
        setCreated(null);
        setDraft(state);
      },
      getReceipt: () =>
        latest.current.created
          ? { status: "created", url: latest.current.created.url, version: latest.current.created.version }
          : { status: "pending" },
      readHandoff: () => ({ error: "No handoff is open on this page. Open a handoff link to read one." }),
      stageContribution: () => ({
        status: "refused" as const,
        reason: "wrong_page",
        message: "This page creates handoffs; it has none open to contribute to. Open a handoff link first, then call stage_contribution there.",
      }),
    };
    let controller: AbortController | null = null;
    registerHandbackTools(bridge).then((result) => {
      controller = result;
      // An extension can install WebMCP after this page decided it was absent.
      // Reflect that, rather than leaving the banner telling the user to go
      // enable something that is already working.
      if (result) setWebMcp(true);
    });
    return () => controller?.abort();
  }, []);

  async function approveAndCreate() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const doc: HandoffDocument = await stampDocument({
        state: draft,
        version: 1,
        createdAt: now,
        updatedAt: now,
        parentHash: null,
        history: [],
      });

      // The key is generated exactly once, here. It goes into the URL fragment
      // and is never regenerated for later versions.
      const key = await generateKey();
      const envelope = await encryptDocument(key, doc);
      const { id, version } = await createHandoff(envelope);
      setCreated({ url: buildHandoffUrl(location.origin, id, await exportKey(key)), version, hash: doc.contentHash! });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the handoff.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setError(null);
    setNotice(null);
    try {
      const result = await readPortableFile(await file.text());
      setCreated(null);
      setDraft(result.state);
      setNotice(
        result.seal === "mismatch"
          ? `Imported, but the file's seal does not match its contents, so it was edited outside Handback. Review it closely before creating.`
          : `Imported from version ${result.originalVersion}. Creating from this makes a new handoff that you own; the original link is untouched.`,
      );
    } catch (cause) {
      setError(cause instanceof ImportError ? cause.message : "Could not read that file.");
    }
  }

  if (created) {
    return (
      <main>
        <Masthead>
          <Seal version={created.version} hash={created.hash} />
        </Masthead>
        <div className="reveal">
          <Field label="Your link" index={0}>
            <p className="caution">
              The key after the <code>#</code> never reaches the server. Anyone holding the whole link can read this
              handoff, so treat it like a password.
            </p>
            <div className="link-row">
              <input
                className="link"
                readOnly
                value={created.url}
                aria-label="Your handoff link"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setError("Could not copy. Select the link and copy it by hand.");
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="actions">
              <a href={created.url}>Open it</a>
            </div>
          </Field>
        </div>
      </main>
    );
  }

  return (
    <main>
      <Masthead />
      <ToolStatus available={webMcp} />
      <ErrorNote error={error} />
      {notice ? <p className="caution">{notice}</p> : null}

      {draft ? (
        <>
          <section className="pending">
            <div className="pending-head">
              <span className="pending-mark" aria-hidden="true" />
              Awaiting you
            </div>
            <h2>Review this handoff</h2>
            <p className="pending-note">
              Your agent assembled this. Nothing has been encrypted, saved or shared yet, and nothing will be until you
              approve it.
            </p>
            <div className="actions">
              <button className="primary" onClick={approveAndCreate} disabled={busy}>
                {busy ? "Encrypting" : "Approve and create"}
              </button>
              <button className="quiet" onClick={() => setDraft(null)} disabled={busy}>
                Discard
              </button>
            </div>
          </section>
          <StateView state={draft} from={1} />
        </>
      ) : (
        <ManualDraftForm onStage={setDraft} onImport={importFile} />
      )}
    </main>
  );
}

/** Fallback for browsers without WebMCP, and for anyone who prefers typing. */
function ManualDraftForm({
  onStage,
  onImport,
}: {
  onStage: (state: HandoffState) => void;
  onImport: (file: File) => void;
}) {
  const [objective, setObjective] = useState("");
  const [summary, setSummary] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="compose"
      onSubmit={(event) => {
        event.preventDefault();
        onStage({ objective, summary, handoffNote: handoffNote || undefined });
      }}
    >
      <h2>Write it yourself</h2>
      <p className="compose-intro muted">Or bring a handoff you exported earlier back in.</p>

      <label>
        <span className="label-text">Objective</span>
        <input type="text" required value={objective} onChange={(event) => setObjective(event.target.value)} />
      </label>
      <label>
        <span className="label-text">Where the work stands</span>
        <textarea required rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label>
        <span className="label-text">Note to whoever picks this up</span>
        <textarea rows={3} value={handoffNote} onChange={(event) => setHandoffNote(event.target.value)} />
      </label>

      <div className="actions">
        <button type="submit" className="primary">
          Stage handoff
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import a file
        </button>
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept="application/json,.json"
          aria-label="Import a Handback export"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.target.value = "";
          }}
        />
      </div>
    </form>
  );
}

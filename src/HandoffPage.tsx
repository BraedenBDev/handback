import { useEffect, useRef, useState } from "react";
import type { Contribution, HandoffDocument, ReadSection } from "../shared/schema.ts";
import { decryptDocument, encryptDocument, importKey, readKeyFromFragment } from "./crypto.ts";
import { ExpiredError, fetchHandoff, updateHandoff, VersionConflictError } from "./api.ts";
import { applyContribution, describeContribution, StaleBaseError } from "./contribution.ts";
import { stampDocument, verifyDocument, type SealVerdict } from "./hash.ts";
import { downloadFile, toMarkdown, toPortableJson } from "./export.ts";
import { isWebMcpAvailable, registerHandbackTools, type WebMcpBridge } from "./webmcp.ts";
import { describeExpiry } from "../shared/expiry.ts";
import { readAutoApprove, writeAutoApprove } from "./auto-approve.ts";
import { ApprovalMode, ErrorNote, Field, HistoryView, Masthead, Seal, StateView, ToolStatus } from "./ui.tsx";

export function HandoffPage({ id }: { id: string }) {
  const [doc, setDoc] = useState<HandoffDocument | null>(null);
  const [seal, setSeal] = useState<SealVerdict>("verified");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [staged, setStaged] = useState<Contribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webMcp, setWebMcp] = useState(isWebMcpAvailable);

  // The content key, imported once from the fragment and reused for every later
  // write. Regenerating it on update would invalidate the link already handed
  // out — the exact bug that sank the first implementation.
  const keyRef = useRef<CryptoKey | null>(null);
  const latest = useRef<{ doc: HandoffDocument | null }>({ doc: null });
  latest.current = { doc };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const encoded = readKeyFromFragment(location.hash);
        if (!encoded) throw new Error("This link is missing its key. Copy the whole link, including the part after the #.");
        const key = await importKey(encoded);
        keyRef.current = key;
        const stored = await fetchHandoff(id);
        const decrypted = await decryptDocument(key, stored.envelope);
        const verdict = await verifyDocument(decrypted);
        if (cancelled) return;
        setDoc(decrypted);
        setSeal(verdict);
        setExpiresAt(stored.expiresAt);
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        setLoading(false);
        if (cause instanceof ExpiredError) {
          setExpired(true);
          setError(null);
          return;
        }
        setError(
          cause instanceof Error && cause.name === "OperationError"
            ? "That key does not decrypt this handoff. The link may be truncated, or from a different handoff."
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
      readSettings: () => ({ requireApproval: !readAutoApprove(), retentionDays: null }),
      writeSettings: (next) => {
        if (next.requireApproval === false) {
          return {
            status: "refused" as const,
            reason: "human_only",
            message:
              "The approval gate can only be switched off by a person, using the control on this page. A tool call can switch it on.",
          };
        }
        if (next.retentionDays !== undefined) {
          return {
            status: "refused" as const,
            reason: "wrong_page",
            message:
              "Retention belongs to the handoff and was set when it was created. This page contributes to an existing one; the window slides on each new version rather than being chosen again.",
          };
        }
        if (next.requireApproval === true) writeAutoApprove(false);
        return { requireApproval: !readAutoApprove(), retentionDays: null };
      },
      stageHandoff: () => ({
        status: "refused" as const,
        reason: "wrong_page",
        message: "A handoff is already open on this page. Use stage_contribution to propose changes to it instead.",
      }),
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
      stageContribution: async (contribution: Contribution) => {
        const current = latest.current.doc;
        if (!current) {
          return {
            status: "refused" as const,
            reason: "not_ready",
            message: "This handoff has not finished decrypting yet. Try again in a moment.",
          };
        }
        if (contribution.baseVersion !== current.version) {
          return { status: "refused" as const, reason: "stale_base" as const, currentVersion: current.version };
        }
        setError(null);
        setStaged(contribution);
        // Read the preference at call time so flipping the switch takes effect
        // on the very next tool call.
        if (readAutoApprove()) {
          const version = await commitContribution(current, contribution);
          if (version) return { status: "committed" as const, version };
        }
        return {
          status: "staged" as const,
          baseVersion: contribution.baseVersion,
          operationCount: contribution.operations.length,
        };
      },
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

  async function approveContribution() {
    if (doc && staged) await commitContribution(doc, staged);
  }

  /** Applies, re-encrypts and saves. Shared by the button and by auto-approval. */
  async function commitContribution(base: HandoffDocument, contribution: Contribution): Promise<number | null> {
    const key = keyRef.current;
    if (!key) return null;
    setBusy(true);
    setError(null);
    try {
      const next = await stampDocument(applyContribution(base, contribution));
      // Same key, new IV. The link already shared keeps working.
      const saved = await updateHandoff(id, await encryptDocument(key, next), base.version);
      setExpiresAt(saved.expiresAt);
      setDoc(next);
      setSeal(await verifyDocument(next));
      setStaged(null);
      return next.version;
    } catch (cause) {
      if (cause instanceof VersionConflictError) {
        setError(
          `Someone else saved a change first, so this handoff is now at version ${cause.currentVersion}. Reload and ask your agent to propose again against the new version.`,
        );
      } else if (cause instanceof StaleBaseError) {
        setError(cause.message);
      } else if (cause instanceof ExpiredError) {
        setExpired(true);
      } else {
        setError(cause instanceof Error ? cause.message : "Could not save the contribution.");
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main>
        <Masthead />
        <p className="loading">Decrypting…</p>
      </main>
    );
  }

  if (expired) {
    return (
      <main>
        <Masthead />
        <Field label="Expired" index={0}>
          <p className="lede">This handoff has expired.</p>
          <p className="muted">
            We deleted its contents on the schedule its creator chose. Nothing here can recover them, and neither can
            we: the server never held the key.
          </p>
          <p className="muted">
            <a href="/">Start a new handoff</a>
          </p>
        </Field>
      </main>
    );
  }

  if (!doc) {
    return (
      <main>
        <Masthead />
        <ErrorNote error={error} />
        <p className="muted">
          <a href="/">Start a new handoff</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <Masthead connect>
        {expiresAt ? (
          <span className="expiry" title={`Deleted ${new Date(expiresAt).toLocaleString()} unless it changes again`}>
            expires {describeExpiry(expiresAt)}
          </span>
        ) : null}
        <Seal version={doc.version} hash={doc.contentHash} verdict={seal} />
      </Masthead>

      <div className="content-card">
      <ToolStatus available={webMcp} />
      <ApprovalMode />
      <ErrorNote error={error} />

      {seal === "mismatch" ? (
        <p className="error" role="alert">
          This version's contents do not match its recorded seal. Something changed it outside the approval path.
          Treat everything below as unverified.
        </p>
      ) : null}

      {staged ? (
        <section className="pending">
          <div className="pending-head">
            <span className="pending-mark" aria-hidden="true" />
            Awaiting you
          </div>
          <h2>Proposed changes</h2>
          <p className="pending-note">{staged.note}</p>
          <ul className="diff">
            {describeContribution(staged).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <div className="actions">
            <button className="primary" onClick={approveContribution} disabled={busy}>
              {busy ? "Saving" : "Approve contribution"}
            </button>
            <button className="quiet" onClick={() => setStaged(null)} disabled={busy}>
              Reject
            </button>
          </div>
        </section>
      ) : null}

      <StateView state={doc.state} from={staged ? 1 : 0} />
      <HistoryView doc={doc} />

      {!staged ? <ManualContributionForm baseVersion={doc.version} onStage={setStaged} /> : null}

      <Field label="Take it with you" index={10}>
        <p className="muted">
          These save to your own device in the clear, so you keep the work if this service disappears. Bring the JSON
          back in from the front page whenever you want it.
          {expiresAt ? " Worth doing before it expires." : ""}
        </p>
        <div className="actions">
          <button onClick={() => downloadFile(`handback-${id}.json`, toPortableJson(doc), "application/json")}>
            Portable file
          </button>
          <button onClick={() => downloadFile(`handback-${id}.md`, toMarkdown(doc), "text/markdown")}>Markdown</button>
        </div>
      </Field>
      </div>
    </main>
  );
}

/**
 * Fallback contribution path. An earlier implementation shipped a fallback that
 * could create a handoff but not contribute to one, which broke the round trip
 * in any browser without WebMCP.
 */
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
      className="compose"
      onSubmit={(event) => {
        event.preventDefault();
        onStage({ baseVersion, note, operations: [{ op, value }] });
        setNote("");
        setValue("");
      }}
    >
      <h2>Propose a change</h2>
      <p className="compose-intro muted">
        Staged for review against version {baseVersion}. Nothing is written until someone approves it.
      </p>

      <label>
        <span className="label-text">What kind</span>
        <select value={op} onChange={(event) => setOp(event.target.value)}>
          <option value="add_decision">Add a decision</option>
          <option value="add_task">Add a task</option>
          <option value="add_open_question">Add an open question</option>
          <option value="set_summary">Replace the summary</option>
        </select>
      </label>
      <label>
        <span className="label-text">Content</span>
        <textarea required rows={3} value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <label>
        <span className="label-text">Why this change</span>
        <input type="text" required value={note} onChange={(event) => setNote(event.target.value)} />
      </label>

      <button type="submit" className="primary">
        Stage contribution
      </button>
    </form>
  );
}

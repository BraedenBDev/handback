import { useEffect, useRef, useState } from "react";
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";
import { buildHandoffUrl, encryptDocument, exportKey, generateKey } from "./crypto.ts";
import { createHandoff } from "./api.ts";
import { stampDocument } from "./hash.ts";
import { ImportError, readPortableFile } from "./import.ts";
import { isWebMcpAvailable, isWebMcpFallback, registerHandbackTools, type WebMcpBridge } from "./webmcp.ts";
import { DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS, RETENTION_CHOICES, describeExpiry, isValidRetention } from "../shared/expiry.ts";
import { readAutoApprove, writeAutoApprove } from "./auto-approve.ts";
import { ApprovalMode, ErrorNote, Field, Masthead, Seal, SiteFooter, StateView, ToolStatus } from "./ui.tsx";
import { Hero } from "./Hero.tsx";
import { DemoLinks } from "./DemoLinks.tsx";
import { Explainer } from "./Explainer.tsx";

export function CreatePage() {
  const [draft, setDraft] = useState<HandoffState | null>(null);
  const [created, setCreated] = useState<{ url: string; version: number; hash: string; expiresAt: string | null } | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(DEFAULT_RETENTION_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [webMcp, setWebMcp] = useState(isWebMcpAvailable);
  const [fallback, setFallback] = useState(isWebMcpFallback);
  const [heroExited, setHeroExited] = useState(false);
  const showHero = !draft && !created;

  // The tools read live state through a ref so registration happens once per
  // document (re-registering a name throws) while still seeing current values.
  const latest = useRef({ created, retentionDays, draft });
  latest.current = { created, retentionDays, draft };

  useEffect(() => {
    const bridge: WebMcpBridge = {
      readSettings: () => ({
        requireApproval: !readAutoApprove(),
        retentionDays: latest.current.retentionDays,
      }),
      writeSettings: (next) => {
        if (next.requireApproval === false) {
          return {
            status: "refused" as const,
            reason: "human_only",
            message:
              "The approval gate can only be switched off by a person, using the control on this page. A tool call can switch it on.",
          };
        }
        if (next.requireApproval === true) writeAutoApprove(false);
        if (next.retentionDays !== undefined) {
          if (!isValidRetention(next.retentionDays)) {
            return {
              status: "refused" as const,
              reason: "invalid_retention",
              message: `retentionDays must be null or a whole number of days from 1 to ${MAX_RETENTION_DAYS}.`,
            };
          }
          setRetentionDays(next.retentionDays);
          latest.current = { ...latest.current, retentionDays: next.retentionDays };
        }
        return { requireApproval: !readAutoApprove(), retentionDays: latest.current.retentionDays };
      },
      stageHandoff: async (state) => {
        setError(null);
        setNotice(null);
        setCreated(null);
        setDraft(state);
        // Read the preference at call time, not at registration time, so
        // flipping the switch takes effect on the very next tool call.
        if (!readAutoApprove()) return;
        const receipt = await createFrom(state);
        return receipt ? { status: "created" as const, url: receipt.url, version: receipt.version } : undefined;
      },
      // Three states, not two. Returning "pending" for a fresh page told an
      // agent a human was about to click something, when in fact nothing had
      // been staged at all. A real ChatGPT session hit exactly this: its tab
      // was reclaimed while it waited for the user, and on reopening the page
      // any receipt check would have reported a phantom approval request.
      getReceipt: () => {
        const created = latest.current.created;
        if (created) return { status: "created" as const, url: created.url, version: created.version };
        if (latest.current.draft) return { status: "pending" as const };
        return {
          status: "none" as const,
          message:
            "This page has not created a handoff. The link lives in page memory, so a reload loses it. Call stage_handoff, and keep the url it returns.",
        };
      },
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
      if (!result) return;
      setWebMcp(isWebMcpAvailable());
      setFallback(isWebMcpFallback());
    });
    return () => controller?.abort();
  }, []);

  async function approveAndCreate() {
    if (draft) await createFrom(draft);
  }

  /** Encrypts and creates. Shared by the button and by auto-approval. */
  async function createFrom(state: HandoffState): Promise<{ url: string; version: number } | null> {
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const doc: HandoffDocument = await stampDocument({
        state,
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
      const { id, version, expiresAt } = await createHandoff(envelope, latest.current.retentionDays);
      const receipt = { url: buildHandoffUrl(location.origin, id, await exportKey(key)), version, expiresAt };
      setCreated({ ...receipt, hash: doc.contentHash! });
      return receipt;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the handoff.");
      return null;
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
          ? `Imported, but the file's seal doesn't match its contents. Something changed it outside Handback, so review it before creating.`
          : `Imported from version ${result.originalVersion}. Creating from this makes a new handoff you own. The original link stays untouched.`,
      );
    } catch (cause) {
      setError(cause instanceof ImportError ? cause.message : "Could not read that file.");
    }
  }

  if (created) {
    return (
      <main>
        <Masthead connect={heroExited || created !== null}>
          <Seal version={created.version} hash={created.hash} />
        </Masthead>
        <div className="content-card">
        <div className="reveal">
          <Field label="Your link" index={0}>
            <p className="caution">
              The key after the <code>#</code> never reaches the server. Anyone holding the whole link can read this
              handoff, so treat it like a password.
              {created.expiresAt ? (
                <>
                  {" "}
                  It expires {describeExpiry(created.expiresAt)}, counted from the last change, after which the
                  contents are deleted. Download a copy if you want to keep it.
                </>
              ) : (
                <> It has no expiry, so it stays until someone deletes it.</>
              )}
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
        </div>
      </main>
    );
  }

  return (
    <main>
      {showHero ? <Hero onExit={() => setHeroExited(true)} /> : null}
      <Masthead connect={heroExited || created !== null} />
      <div className="content-card">
      <ToolStatus available={webMcp} fallback={fallback} />
      <ApprovalMode />
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
              Your agent assembled this. Nothing here is encrypted, saved, or shared until you approve it.
            </p>
            <label className="retention">
              <span className="label-text">Keep it for</span>
              <select
                value={String(retentionDays)}
                onChange={(event) => setRetentionDays(event.target.value === "null" ? null : Number(event.target.value))}
              >
                {RETENTION_CHOICES.map((choice) => (
                  <option key={String(choice.days)} value={String(choice.days)}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
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
      </div>
      {/*
        These explain the product, so they sit above nothing and below the
        card, and they are NOT gated on showHero any more: a judge who creates
        a handoff used to make them disappear with no route back to them.
      */}
      <DemoLinks />
      <Explainer />
      <SiteFooter />
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

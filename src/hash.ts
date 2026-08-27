/**
 * Content hashing — the provenance chain the IMPLEMENTATION-SPEC called for.
 *
 * Every version carries a hash of its own content and the hash of the version
 * it descends from. That makes the chain tamper-evident: a document whose state
 * was edited outside the approval path no longer hashes to its recorded
 * contentHash, and the UI can say so.
 *
 * This is NOT a signature. It proves internal consistency, not authorship —
 * anyone holding the key can recompute a valid hash. Do not let the seal in the
 * UI imply more than that.
 */
import type { HandoffDocument, HandoffState } from "../shared/schema.ts";

/**
 * Stable JSON. Object keys are sorted recursively so the same logical state
 * always hashes identically, whatever order the properties happen to be in.
 * Array order is content, not formatting, so it is preserved.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Binds the state to its position in the chain, so a version cannot be replayed elsewhere. */
export function computeContentHash(
  state: HandoffState,
  version: number,
  parentHash: string | null,
): Promise<string> {
  return sha256Hex(`handback-v1\n${version}\n${parentHash ?? ""}\n${canonicalize(state)}`);
}

/** The short form shown in the UI. Enough to compare by eye, never used to verify. */
export function sealOf(hash: string | undefined | null): string {
  return hash ? hash.slice(0, 8) : "········";
}

export async function stampDocument(
  doc: Omit<HandoffDocument, "contentHash">,
): Promise<HandoffDocument> {
  return { ...doc, contentHash: await computeContentHash(doc.state, doc.version, doc.parentHash ?? null) };
}

export type SealVerdict = "verified" | "mismatch" | "unsealed";

/** Recomputes the hash from the document's own contents and compares. */
export async function verifyDocument(doc: HandoffDocument): Promise<SealVerdict> {
  if (!doc.contentHash) return "unsealed"; // created before sealing existed
  const expected = await computeContentHash(doc.state, doc.version, doc.parentHash ?? null);
  return expected === doc.contentHash ? "verified" : "mismatch";
}

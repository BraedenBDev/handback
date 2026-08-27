/**
 * Client-side AES-256-GCM. Runs identically in the browser and in Node's test
 * runner because it only touches globalThis.crypto (Web Crypto), never node:crypto.
 *
 * The one rule this module exists to enforce: a handoff has exactly ONE content
 * key, generated when the handoff is created and carried in the URL fragment.
 * Re-encrypting after a contribution reuses that same key. Generating a fresh
 * key on update would silently invalidate every link already handed out.
 */
import type { Envelope, HandoffDocument } from "../shared/schema.ts";

const FORMAT = "handback-aes256gcm-v1" as const;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function generateKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await globalThis.crypto.subtle.exportKey("raw", key);
  return toBase64Url(new Uint8Array(raw));
}

export async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = fromBase64Url(encoded);
  if (raw.byteLength !== 32) throw new Error("Handback key must be 256 bits");
  return globalThis.crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptDocument(
  key: CryptoKey,
  doc: HandoffDocument,
): Promise<Envelope> {
  // A fresh 96-bit IV per write. Reusing an IV under the same key breaks GCM
  // outright, and every contribution re-encrypts under the original key.
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(doc));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plaintext as unknown as BufferSource,
  );
  return {
    format: FORMAT,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptDocument(
  key: CryptoKey,
  envelope: Envelope,
): Promise<HandoffDocument> {
  if (envelope.format !== FORMAT) {
    throw new Error(`Unsupported envelope format: ${envelope.format}`);
  }
  // A wrong key fails here as an OperationError, because GCM authenticates.
  // That is the intended behaviour: there is no partial or silent decrypt.
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.iv) as unknown as BufferSource },
    key,
    fromBase64Url(envelope.ciphertext) as unknown as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as HandoffDocument;
}

/** Reads the key from `#k=...`. The fragment is never sent in an HTTP request. */
export function readKeyFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("k");
}

export function buildHandoffUrl(origin: string, id: string, keyEncoded: string): string {
  return `${origin}/h/${id}#k=${keyEncoded}`;
}

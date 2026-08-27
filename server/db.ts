/**
 * Ciphertext store, append-only.
 *
 * Every version's envelope is kept rather than overwritten. Handback's whole
 * promise is that work survives, and a store that overwrites gives you version
 * *numbers* without version *history* — a bad write, or a contribution approved
 * against a corrupted state, would be unrecoverable. (Borrowed from the parallel
 * Hermes implementation, which got this right where the first version here did not.)
 *
 * The schema stays this narrow deliberately. No title column, no summary column,
 * no search index — any of those would mean the server holds plaintext derived
 * from the handoff. If you are tempted to add one for convenience, that is the
 * moment the product promise breaks.
 */
import { DatabaseSync } from "node:sqlite";

export type StoredEnvelope = {
  handoffId: string;
  version: number;
  format: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export function openDatabase(path = "handback.sqlite"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS handoffs (
      id             TEXT PRIMARY KEY,
      currentVersion INTEGER NOT NULL,
      createdAt      TEXT NOT NULL,
      updatedAt      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS envelopes (
      handoffId  TEXT NOT NULL,
      version    INTEGER NOT NULL,
      format     TEXT NOT NULL,
      iv         TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      createdAt  TEXT NOT NULL,
      PRIMARY KEY (handoffId, version),
      FOREIGN KEY (handoffId) REFERENCES handoffs(id)
    );
  `);
  return db;
}

export function newHandoffId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

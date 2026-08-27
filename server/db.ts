/**
 * Ciphertext store. Uses node:sqlite (built into Node 22+) so there is no
 * native dependency to compile.
 *
 * The schema is deliberately this narrow. There is no title column, no summary
 * column, no owner column and no search index, because any of those would mean
 * the server holds plaintext derived from the handoff. If you are tempted to
 * add one for convenience, that is the moment the product promise breaks.
 */
import { DatabaseSync } from "node:sqlite";

export type StoredHandoff = {
  id: string;
  version: number;
  envelope: string;
  createdAt: string;
  updatedAt: string;
};

export function openDatabase(path = "handback.sqlite"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS handoffs (
      id         TEXT PRIMARY KEY,
      version    INTEGER NOT NULL,
      envelope   TEXT NOT NULL,
      createdAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL
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

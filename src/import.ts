/**
 * Reading a portable file back in.
 *
 * Export without import made the "you still have the work" promise only half
 * true. Importing deliberately creates a NEW handoff that the importer owns,
 * rather than writing into the original link: possessing a downloaded copy is
 * not authority over someone else's object, and pretending otherwise would be
 * the more dangerous behaviour.
 */
import { HANDOFF_STATE_SCHEMA, type HandoffDocument, type HandoffState } from "../shared/schema.ts";
import { validate } from "../shared/validate.ts";
import { verifyDocument, type SealVerdict } from "./hash.ts";

export type ImportResult = {
  state: HandoffState;
  seal: SealVerdict;
  originalVersion: number;
  historyLength: number;
};

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export async function readPortableFile(text: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("That file is not valid JSON.");
  }

  const doc = parsed as Partial<HandoffDocument> & { format?: string };
  if (doc.format !== "handback-portable-v1") {
    throw new ImportError("That file is not a Handback export.");
  }
  const check = validate(doc.state, HANDOFF_STATE_SCHEMA);
  if (!check.valid) {
    throw new ImportError(`The handoff inside that file is not valid. ${check.errors.slice(0, 3).join("; ")}`);
  }

  // Report the seal rather than refusing on a mismatch. A file whose hash no
  // longer matches is still the user's work; they need to be told, not blocked.
  const seal = await verifyDocument(doc as HandoffDocument);

  return {
    state: doc.state as HandoffState,
    seal,
    originalVersion: typeof doc.version === "number" ? doc.version : 1,
    historyLength: Array.isArray(doc.history) ? doc.history.length : 0,
  };
}

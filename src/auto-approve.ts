/**
 * Per-device auto-approval.
 *
 * The approval click is the product's consent boundary, but asking for it on
 * every operation is friction the person already consented to by asking their
 * agent to do the work. This moves consent from per-action to per-device: the
 * human flips it once, deliberately, and this browser stops asking.
 *
 * It is safe to offer because storage is append-only. Every version's ciphertext
 * is kept, so anything committed automatically is still readable at the previous
 * version and recoverable. Auto-approval removes the prompt, not the record.
 *
 * Off by default. A visitor who has never chosen gets the gate.
 */
const KEY = "handback-auto-approve";

export function readAutoApprove(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    // Private windows and blocked site data throw on access, not just on read.
    return false;
  }
}

export function writeAutoApprove(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // A preference that does not persist is still a preference for this visit.
  }
}

/**
 * Per-device auto-approval.
 *
 * Asking for a click on every operation is friction the person already
 * consented to by asking their agent to do the work, so consent lives
 * per-device rather than per-action: `stage_handoff` creates immediately and
 * returns the link in the same call, and `stage_contribution` commits
 * immediately.
 *
 * The record survives regardless. Storage is append-only, so every version's
 * ciphertext is kept and anything committed automatically is still readable at
 * the previous version. Auto-approval removes the prompt, not the record.
 *
 * **On by default** (changed 2026-08-30, deliberately). A visitor who has never
 * chosen gets the hands-free flow; turning the gate back on is one click on the
 * approval strip, and that choice persists per device.
 *
 * Understand what this trades away before changing it back or relying on it:
 * the click was the only thing standing between a prompt-injected agent and
 * publishing the conversation to a public URL with no human in the loop. The
 * content is encrypted client-side and the key never reaches the server, but an
 * agent that can call the tool can also read back the link it just minted.
 */
const KEY = "handback-auto-approve";

export function readAutoApprove(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    // Only an explicit "off" restores the gate; unset means the new default.
    return stored !== "off";
  } catch {
    // Private windows and blocked site data throw on access, not just on read.
    return true;
  }
}

export function writeAutoApprove(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // A preference that does not persist is still a preference for this visit.
  }
}

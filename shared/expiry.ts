/**
 * How long a handoff sticks around.
 *
 * The window slides: it is measured from the last approved write rather than
 * from creation, so a handoff someone is still working on does not disappear
 * mid-collaboration. Choosing "never" stores no expiry at all.
 */
export const RETENTION_CHOICES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: null, label: "Never" },
] as const;

export const DEFAULT_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 365;

export function isValidRetention(value: unknown): value is number | null {
  if (value === null) return true;
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_RETENTION_DAYS;
}

/** ISO timestamp `days` from `from`, or null when the handoff never expires. */
export function expiryFrom(days: number | null, from: Date | string = new Date()): string | null {
  if (days === null) return null;
  const start = typeof from === "string" ? new Date(from) : from;
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function hasExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** "in 6 days", "in 4 hours", "in a few minutes". Plain enough to act on. */
export function describeExpiry(expiresAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `in ${Math.round(hours / 24)} days`;
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

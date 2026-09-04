import type { Envelope } from "../shared/schema.ts";

export type StoredResponse = {
  id: string;
  version: number;
  currentVersion?: number;
  envelope: Envelope;
  expiresAt: string | null;
};

export class ExpiredError extends Error {
  constructor() {
    super("This handoff has expired and its contents have been deleted.");
    this.name = "ExpiredError";
  }
}

export class VersionConflictError extends Error {
  constructor(public currentVersion: number) {
    super(`This handoff has moved on to version ${currentVersion}.`);
    this.name = "VersionConflictError";
  }
}

export async function createHandoff(
  envelope: Envelope,
  retentionDays: number | null,
): Promise<{ id: string; version: number; expiresAt: string | null }> {
  const response = await fetch("/api/h", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope, retentionDays }),
  });
  if (!response.ok) throw new Error(`Could not create handoff (${response.status})`);
  return response.json();
}

export async function fetchHandoff(id: string, version?: number): Promise<StoredResponse> {
  // No version means current. The server keeps every envelope, so an explicit
  // version reads an earlier one without touching what this page has open.
  const query = version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
  const response = await fetch(`/api/h/${encodeURIComponent(id)}${query}`);
  if (response.status === 410) throw new ExpiredError();
  if (response.status === 404) {
    throw new Error(
      version === undefined
        ? "No handoff exists at this link."
        : `This handoff has no version ${version}.`,
    );
  }
  if (!response.ok) throw new Error(`Could not load handoff (${response.status})`);
  return response.json();
}

export async function updateHandoff(
  id: string,
  envelope: Envelope,
  expectedVersion: number,
): Promise<{ id: string; version: number; expiresAt: string | null }> {
  const response = await fetch(`/api/h/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope, expectedVersion }),
  });
  if (response.status === 410) throw new ExpiredError();
  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as { currentVersion?: number };
    throw new VersionConflictError(body.currentVersion ?? -1);
  }
  if (!response.ok) throw new Error(`Could not save contribution (${response.status})`);
  return response.json();
}

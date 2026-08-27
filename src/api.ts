import type { Envelope } from "../shared/schema.ts";

export type StoredResponse = { id: string; version: number; envelope: Envelope };

export class VersionConflictError extends Error {
  constructor(public currentVersion: number) {
    super(`This handoff has moved on to version ${currentVersion}.`);
    this.name = "VersionConflictError";
  }
}

export async function createHandoff(envelope: Envelope): Promise<{ id: string; version: number }> {
  const response = await fetch("/api/h", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope }),
  });
  if (!response.ok) throw new Error(`Could not create handoff (${response.status})`);
  return response.json();
}

export async function fetchHandoff(id: string): Promise<StoredResponse> {
  const response = await fetch(`/api/h/${encodeURIComponent(id)}`);
  if (response.status === 404) throw new Error("No handoff exists at this link.");
  if (!response.ok) throw new Error(`Could not load handoff (${response.status})`);
  return response.json();
}

export async function updateHandoff(
  id: string,
  envelope: Envelope,
  expectedVersion: number,
): Promise<{ id: string; version: number }> {
  const response = await fetch(`/api/h/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope, expectedVersion }),
  });
  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as { currentVersion?: number };
    throw new VersionConflictError(body.currentVersion ?? -1);
  }
  if (!response.ok) throw new Error(`Could not save contribution (${response.status})`);
  return response.json();
}

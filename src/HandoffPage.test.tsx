// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HandoffDocument } from "../shared/schema.ts";
import { shouldSkipFlash } from "./connect-flash.ts";
import { HandoffPage } from "./HandoffPage.tsx";

vi.mock("./connect-flash.ts", () => ({
  // A spy, not a plain function: proves the connect sequence actually reached
  // the flash gate, which only happens once `connect` reaches Masthead as
  // true. Still returns true, so the real WebGL path never runs in jsdom.
  shouldSkipFlash: vi.fn(() => true),
  playConnectFlash: vi.fn(),
}));

vi.mock("./webmcp.ts", () => ({
  isWebMcpAvailable: () => false,
  isWebMcpFallback: () => false,
  registerHandbackTools: vi.fn(async () => null),
}));

vi.mock("./hash.ts", async (importOriginal) => {
  // jsdom's crypto.subtle is not usable in this test environment, so the real
  // content-hash math (verifyDocument/stampDocument) can't run here. Keep the
  // rest of the module real — Seal's sealOf() needs it — and short-circuit
  // only verifyDocument.
  const actual = await importOriginal<typeof import("./hash.ts")>();
  return { ...actual, verifyDocument: vi.fn(async () => "verified" as const) };
});

const DOC: HandoffDocument = {
  state: { objective: "Ship the thing", summary: "In progress." },
  version: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  contentHash: "deadbeef",
  parentHash: null,
  history: [],
};

vi.mock("./api.ts", () => ({
  ExpiredError: class ExpiredError extends Error {},
  VersionConflictError: class VersionConflictError extends Error {},
  fetchHandoff: vi.fn(async () => ({
    id: "test-id-0000000000000000",
    version: 1,
    envelope: { format: "handback-aes256gcm-v1" as const, iv: "", ciphertext: "" },
    expiresAt: null,
  })),
  updateHandoff: vi.fn(),
}));

vi.mock("./crypto.ts", () => ({
  readKeyFromFragment: () => "fake-key-fragment",
  importKey: vi.fn(async () => ({}) as CryptoKey),
  decryptDocument: vi.fn(async () => DOC),
  encryptDocument: vi.fn(),
}));

describe("HandoffPage connect sequence", () => {
  it("passes connect=true to Masthead once the handoff has decrypted", async () => {
    render(<HandoffPage id="test-id-0000000000000000" />);
    await screen.findByText(/Handback/); // masthead is up

    // shouldSkipFlash is only reached once `connect` arrives at Masthead as
    // true, which only happens once decryption has finished — so this proves
    // the connect sequence actually fired. (Checking only the final "not
    // arriving" state would also pass if it had never fired at all, since
    // that's the class's resting state too.)
    await vi.waitFor(() => expect(shouldSkipFlash).toHaveBeenCalled());

    const slot = document.querySelector(".mark-slot")!;
    await vi.waitFor(() => expect(slot.classList.contains("mark-slot-arriving")).toBe(false));
  });
});

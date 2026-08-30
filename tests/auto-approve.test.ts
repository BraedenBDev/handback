// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAutoApprove, writeAutoApprove } from "../src/auto-approve.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("auto-approval preference", () => {
  it("is on for anyone who has never chosen", () => {
    expect(readAutoApprove()).toBe(true);
  });

  it("persists a choice and can be turned back on", () => {
    writeAutoApprove(false);
    expect(readAutoApprove()).toBe(false);
    writeAutoApprove(true);
    expect(readAutoApprove()).toBe(true);
  });

  it("only an explicit off restores the gate", () => {
    localStorage.setItem("handback-auto-approve", "maybe");
    expect(readAutoApprove()).toBe(true);
    localStorage.setItem("handback-auto-approve", "off");
    expect(readAutoApprove()).toBe(false);
  });

  it("stays on when storage throws, as it does in a private window", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("The operation is insecure.");
    });
    expect(readAutoApprove()).toBe(true);
  });

  it("does not throw when storage refuses a write", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeAutoApprove(true)).not.toThrow();
  });
});

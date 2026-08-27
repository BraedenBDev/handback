// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAutoApprove, writeAutoApprove } from "../src/auto-approve.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("auto-approval preference", () => {
  it("is off for anyone who has never chosen", () => {
    expect(readAutoApprove()).toBe(false);
  });

  it("persists a choice and can be turned back off", () => {
    writeAutoApprove(true);
    expect(readAutoApprove()).toBe(true);
    writeAutoApprove(false);
    expect(readAutoApprove()).toBe(false);
  });

  it("treats an unrecognised stored value as off, failing closed", () => {
    localStorage.setItem("handback-auto-approve", "maybe");
    expect(readAutoApprove()).toBe(false);
  });

  it("stays off when storage throws, as it does in a private window", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("The operation is insecure.");
    });
    expect(readAutoApprove()).toBe(false);
  });

  it("does not throw when storage refuses a write", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeAutoApprove(true)).not.toThrow();
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { shouldSkipFlash } from "./connect-flash.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shouldSkipFlash", () => {
  it("skips when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    expect(shouldSkipFlash()).toBe(true);
  });

  it("skips when no WebGL context is available", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(shouldSkipFlash()).toBe(true);
  });

  it("does not skip when motion is fine and WebGL is available", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as WebGLRenderingContext);
    expect(shouldSkipFlash()).toBe(false);
  });
});

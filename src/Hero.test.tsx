// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hero } from "./Hero.tsx";

describe("Hero", () => {
  let observed: IntersectionObserverCallback | null = null;

  beforeEach(() => {
    observed = null;
    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        observed = cb;
      }
      observe() {}
      disconnect() {}
    }
    // @ts-expect-error test stub
    global.IntersectionObserver = MockIO;
  });
  afterEach(() => {
    // @ts-expect-error test stub
    delete global.IntersectionObserver;
  });

  it("calls onExit once the sentinel crosses below the 35% threshold", () => {
    const onExit = vi.fn();
    render(<Hero onExit={onExit} />);
    expect(onExit).not.toHaveBeenCalled();

    observed!(
      [{ intersectionRatio: 0.1 } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

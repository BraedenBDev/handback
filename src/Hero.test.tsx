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

  it("points the ChatGPT pill at the real download page, in a new tab", () => {
    // The pill is the page's one outbound call to action, and a link that
    // quietly stops working is not visible from anywhere else in the suite.
    const { container } = render(<Hero onExit={vi.fn()} />);
    const pill = container.querySelector("a.chatgpt-pill") as HTMLAnchorElement;
    expect(pill).toBeTruthy();
    expect(pill.getAttribute("href")).toBe("https://chatgpt.com/download");
    expect(pill.textContent).toContain("Try it now in ChatGPT Desktop");
    expect(pill.textContent).toContain("Work & Codex");
    // Leaving the site mid-handoff would lose a draft that lives in page memory.
    expect(pill.getAttribute("target")).toBe("_blank");
    expect(pill.getAttribute("rel")).toContain("noopener");
    // The mark is decoration; the anchor's own text is the accessible name.
    expect(container.querySelector(".chatgpt-pill-mark")?.getAttribute("aria-hidden")).toBe("true");
  });
});

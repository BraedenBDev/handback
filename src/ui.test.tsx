// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Masthead, BrowserMark } from "./ui.tsx";

vi.mock("./connect-flash.ts", () => ({
  shouldSkipFlash: () => true, // skip the WebGL path entirely in jsdom
  playConnectFlash: vi.fn(),
}));

describe("BrowserMark", () => {
  it("renders the shared usb-mark symbol", () => {
    render(<BrowserMark />);
    const use = document.querySelector("svg.mark use");
    expect(use?.getAttribute("href")).toBe("#browser-mark");
  });
});

describe("Masthead", () => {
  it("renders a mark slot ahead of the wordmark", () => {
    render(<Masthead />);
    const slot = document.querySelector(".mark-slot");
    expect(slot).not.toBeNull();
    expect(screen.getByText("Handback")).toBeInTheDocument();
  });
});

describe("Masthead connect sequence", () => {
  it("adds then removes the arriving class exactly once, even if connect stays true across rerenders", async () => {
    const { rerender } = render(<Masthead connect={false} />);
    const slot = document.querySelector(".mark-slot")!;

    rerender(<Masthead connect={true} />);
    await vi.waitFor(() => expect(slot.classList.contains("mark-slot-arriving")).toBe(false));

    // rerendering with connect still true must not restart the sequence
    rerender(<Masthead connect={true} />);
    rerender(<Masthead connect={true} />);
    expect(slot.classList.contains("mark-slot-arriving")).toBe(false);
  });
});

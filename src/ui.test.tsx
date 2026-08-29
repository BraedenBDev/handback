// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Masthead, UsbMark } from "./ui.tsx";

describe("UsbMark", () => {
  it("renders the shared usb-mark symbol", () => {
    render(<UsbMark />);
    const use = document.querySelector("svg.mark use");
    expect(use?.getAttribute("href")).toBe("#usb-mark");
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

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Explainer } from "./Explainer.tsx";

// This project doesn't run vitest with globals, so RTL never auto-registers
// its own afterEach — two renders in one file would otherwise stack in the
// same document and every getByRole would find duplicates.
afterEach(cleanup);

describe("Explainer", () => {
  it("opens the first step on load so the section is never wordless", () => {
    render(<Explainer />);
    expect(screen.getByRole("button", { name: /How you start/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /It drafts, you review/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles a panel independently of the others", () => {
    render(<Explainer />);

    const first = screen.getByRole("button", { name: /How you start/ });
    const second = screen.getByRole("button", { name: /It drafts, you review/ });

    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Explainer } from "./Explainer.tsx";

describe("Explainer", () => {
  it("toggles a panel open independently of the others", () => {
    render(<Explainer />);

    const first = screen.getByRole("button", { name: /How you start/ });
    const second = screen.getByRole("button", { name: /It drafts, you review/ });
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");
  });
});

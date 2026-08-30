// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoLinks } from "./DemoLinks.tsx";

describe("DemoLinks", () => {
  it("opens a card into a labeled, non-live example panel and closes on Escape", () => {
    render(<DemoLinks />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Postgres → Neon cutover"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Example content — not a live link")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

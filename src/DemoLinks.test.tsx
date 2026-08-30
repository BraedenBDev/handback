// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoLinks } from "./DemoLinks.tsx";

describe("DemoLinks", () => {
  it("opens a card into a labeled, non-live example panel with its title, closes on Escape", async () => {
    render(<DemoLinks />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Postgres → Neon cutover"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Example content — not a live link")).toBeInTheDocument();
    expect(screen.getAllByText("Postgres → Neon cutover").length).toBeGreaterThan(1);

    fireEvent.keyDown(document, { key: "Escape" });
    // Escape starts the exit animation; the panel unmounts ~140ms later.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

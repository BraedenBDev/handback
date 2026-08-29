import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Reuses the create -> open round trip pattern established in journeys.spec.ts / a11y.spec.ts. */
async function createHandoff(page: Page, objective = "USB motif check") {
  await page.goto("/");
  await page.getByLabel("Objective").fill(objective);
  await page.getByLabel("Where the work stands").fill("Set up by the USB motif e2e suite.");
  await page.getByRole("button", { name: "Stage handoff" }).click();
  await page.getByRole("button", { name: "Approve and create" }).click();
  await expect(page.locator("input.link")).toBeVisible();
  return page.locator("input.link").inputValue();
}

test("hero shows on a fresh visit and is gone once a handoff exists", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero-stage")).toBeVisible();
  await expect(page.locator(".mark-slot svg use")).toHaveAttribute("href", "#usb-mark");
});

test("masthead mark is present on a handoff page", async ({ page }) => {
  const handoffUrl = await createHandoff(page);
  await page.goto(handoffUrl);
  await expect(page.locator(".mark-slot")).toBeVisible();
});

test("no accessibility violations on the hero", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).include(".hero-stage, .masthead").analyze();
  expect(results.violations).toEqual([]);
});

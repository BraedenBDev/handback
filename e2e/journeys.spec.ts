import { expect, test, type Page } from "@playwright/test";

/** Everything a person can do without an agent, plus every way it can go wrong. */

async function createHandoff(page: Page, objective = "Journey test") {
  await page.goto("/");
  await page.getByLabel("Objective").fill(objective);
  await page.getByLabel("Where the work stands").fill("Set up by the journey suite.");
  await page.getByRole("button", { name: "Stage handoff" }).click();
  await page.getByRole("button", { name: "Approve and create" }).click();
  await expect(page.locator("input.link")).toBeVisible();
  return page.locator("input.link").inputValue();
}

test.describe("error states", () => {
  test("a link with no key explains what is missing", async ({ page }) => {
    const url = await createHandoff(page);
    await page.goto(url.split("#")[0]!);
    await expect(page.getByRole("alert")).toContainText("missing its key");
  });

  test("a truncated key is reported as a key problem, not a server error", async ({ page }) => {
    const url = await createHandoff(page);
    const [base, key] = url.split("#k=");
    await page.goto(`${base}#k=${key!.slice(0, -6)}`);
    await expect(page.getByRole("alert")).toContainText(/key|decrypt/i);
  });

  test("a valid key from a different handoff fails closed", async ({ page }) => {
    const first = await createHandoff(page, "First");
    const second = await createHandoff(page, "Second");
    const wrongPairing = `${first.split("#k=")[0]}#k=${second.split("#k=")[1]}`;
    await page.goto(wrongPairing);
    await expect(page.getByRole("alert")).toContainText("does not decrypt");
    await expect(page.getByText("First")).toHaveCount(0);
  });

  test("an unknown handoff id says so plainly", async ({ page }) => {
    await page.goto("/h/aaaaaaaaaaaaaaaaaaaa#k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("a failed load still offers a way forward", async ({ page }) => {
    await page.goto("/h/aaaaaaaaaaaaaaaaaaaa#k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("link", { name: "Start a new handoff" })).toBeVisible();
  });
});

test.describe("the seal", () => {
  test("shows a verified seal on a freshly created handoff", async ({ page }) => {
    const url = await createHandoff(page);
    await page.goto(url);
    const seal = page.locator(".seal");
    await expect(seal).toHaveAttribute("data-verdict", "verified");
    await expect(seal.locator(".seal-version")).toHaveText("v1");
  });

  test("advances the seal when a contribution is approved", async ({ page }) => {
    const url = await createHandoff(page);
    await page.goto(url);
    const before = await page.locator(".seal").innerText();

    await page.getByLabel("Content").fill("A decision worth recording");
    await page.getByLabel(/Why/).fill("Because the suite says so");
    await page.getByRole("button", { name: "Stage contribution" }).click();
    await page.getByRole("button", { name: "Approve contribution" }).click();

    await expect(page.locator(".seal .seal-version")).toHaveText("v2");
    expect(await page.locator(".seal").innerText()).not.toBe(before);
    await expect(page.locator(".seal")).toHaveAttribute("data-verdict", "verified");
  });
});

test.describe("exports and import", () => {
  test("downloads a portable file and a markdown file", async ({ page }) => {
    const url = await createHandoff(page, "Exportable");
    await page.goto(url);

    for (const [label, extension] of [["Portable file", ".json"], ["Markdown", ".md"]] as const) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: label }).click();
      const file = await download;
      expect(file.suggestedFilename()).toContain(extension);
    }
  });

  test("a downloaded portable file can be imported back in", async ({ page }, testInfo) => {
    const url = await createHandoff(page, "Round trips through a file");
    await page.goto(url);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Portable file" }).click();
    const path = testInfo.outputPath("handback.json");
    await (await download).saveAs(path);

    await page.goto("/");
    await page.getByLabel("Import a Handback export").setInputFiles(path);
    await expect(page.getByText("Round trips through a file")).toBeVisible();
    await expect(page.getByText(/Imported from version/)).toBeVisible();
  });

  test("refuses a file that is not a Handback export", async ({ page }, testInfo) => {
    const path = testInfo.outputPath("not-handback.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, JSON.stringify({ hello: "world" }));

    await page.goto("/");
    await page.getByLabel("Import a Handback export").setInputFiles(path);
    await expect(page.getByRole("alert")).toContainText("not a Handback export");
  });
});

test.describe("theme", () => {
  test("honours the system preference with no stored choice", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Warm near-black, not the light paper.
    expect(background).toBe("rgb(21, 19, 15)");
  });

  test("a manual choice overrides the system preference and survives reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: /Switch to light theme/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(251, 249, 245)");
  });
});

test.describe("responsive", () => {
  for (const [name, width, height] of [["mobile", 375, 812], ["tablet", 768, 1024], ["desktop", 1440, 900]] as const) {
    test(`does not scroll horizontally at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const url = await createHandoff(page, "A deliberately long objective that must wrap rather than push the layout wider than the viewport");
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

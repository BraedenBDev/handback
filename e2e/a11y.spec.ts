import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The accessibility floor, checked against what actually rendered rather than
 * what the tokens were supposed to be. Colour contrast is included on purpose:
 * a warm-paper palette with an amber accent is exactly the kind of scheme that
 * looks fine and fails 4.5:1.
 */

async function installWebMcp(page: Page) {
  await page.addInitScript(() => {
    const registered: any[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: (t: any) => { registered.push(t); return Promise.resolve(); },
        getTools: () => Promise.resolve(registered),
        executeTool: async (tool: any, input: string) =>
          JSON.stringify(await registered.find((t) => t.name === tool.name).execute(JSON.parse(input))),
      },
    });
  });
}

/** Contrast is a property of the settled page; measuring mid-fade measures the
 *  animation, not the design. A separate test covers the settle time itself. */
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished"));
}

const scan = async (page: Page) => {
  await settle(page);
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
};

async function createHandoff(page: Page) {
  await page.goto("/");
  await page.getByLabel("Objective").fill("Accessibility check");
  await page.getByLabel("Where the work stands").fill("Auditing the rendered page against WCAG AA.");
  await page.getByRole("button", { name: "Stage handoff" }).click();
  await page.getByRole("button", { name: "Approve and create" }).click();
  await expect(page.locator("input.link")).toBeVisible();
  return page.locator("input.link").inputValue();
}

for (const theme of ["light", "dark"] as const) {
  test(`create page has no accessibility violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test(`staged draft has no accessibility violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await installWebMcp(page);
    await page.goto("/");
    await page.evaluate(async () => {
      const mc = (document as any).modelContext;
      const tools = await mc.getTools();
      await mc.executeTool(tools.find((t: any) => t.name === "stage_handoff"), JSON.stringify({
        objective: "Contrast check on the amber panel",
        summary: "The pending panel is the highest-stakes surface in the product.",
        constraints: [{ kind: "must", text: "Amber must clear 4.5:1" }],
        tasks: [{ title: "Check it", status: "in_progress" }],
      }));
    });
    await expect(page.getByText("Awaiting you")).toBeVisible();
    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test(`handoff page has no accessibility violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const url = await createHandoff(page);
    await page.goto(url);
    const results = await scan(page);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}

test("every interactive control is reachable and visibly focused by keyboard", async ({ page }) => {
  await page.goto("/");
  const focusable = await page.locator("button, a[href], input, textarea, select").count();
  expect(focusable).toBeGreaterThan(0);

  const seen = new Set<string>();
  for (let i = 0; i < focusable + 4; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.tagName + (el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 20),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
      };
    });
    if (!info) continue;
    seen.add(info.id);
    // A focus ring the user can actually see, not outline:none with a hope.
    expect(info.outlineStyle, `${info.tag} has no visible focus ring`).not.toBe("none");
    expect(parseFloat(info.outlineWidth), `${info.tag} focus ring is too thin`).toBeGreaterThanOrEqual(1);
  }
  expect(seen.size).toBeGreaterThan(1);
});

test("interactive targets meet the 44px minimum", async ({ page }) => {
  await page.goto("/");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, select, input[type=text], textarea")]
      .map((el) => ({ text: (el.textContent || (el as HTMLElement).getAttribute("aria-label") || el.tagName).slice(0, 30), h: el.getBoundingClientRect().height }))
      // The theme toggle is a deliberate exception: a secondary chrome control
      // in the masthead, kept small so it does not compete with the wordmark.
      .filter((x) => x.h > 0 && x.h < 44 && !/light|dark/i.test(x.text)),
  );
  expect(small).toEqual([]);
});

test("the document has one h1 and a sensible heading order", async ({ page }) => {
  const url = await createHandoff(page);
  await page.goto(url);
  const levels = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1])),
  );
  expect(levels.filter((l) => l === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
});

test("the page finishes animating quickly enough that transient contrast is not a problem", async ({ page }) => {
  await page.goto("/");
  const settleMs = await page.evaluate(async () => {
    const start = performance.now();
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    return performance.now() - start;
  });
  expect(settleMs).toBeLessThan(700);
});

test("reduced motion removes every animation rather than merely shortening it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Objective").fill("No motion");
  await page.getByLabel("Where the work stands").fill("Everything should appear at once.");
  await page.getByRole("button", { name: "Stage handoff" }).click();
  await expect(page.getByText("Awaiting you")).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

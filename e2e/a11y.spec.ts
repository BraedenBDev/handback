import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The accessibility floor, checked against what actually rendered rather than
 * what the tokens were supposed to be. Colour contrast is included on purpose:
 * a warm-paper palette with an amber accent is exactly the kind of scheme that
 * looks fine and fails 4.5:1.
 */

/**
 * Turns the approval gate back on before first paint. Auto-approval is the
 * default now, so any test that exercises the stage-then-approve path has to
 * ask for the gate explicitly rather than assume it.
 */
async function requireApproval(page: Page) {
  await page.addInitScript(() => localStorage.setItem("handback-auto-approve", "off"));
}

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
 *  animation, not the design. A separate test covers the settle time itself.
 *  Perpetual decorative loops (the hero's idle drift, its LED) are excluded —
 *  they run by design and never reach "finished". */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      const iterations = a.effect?.getComputedTiming().iterations;
      return iterations === Infinity || a.playState === "finished";
    }),
  );
}

/**
 * Scans run with motion reduced. The hero loops a scripted conversation for as
 * long as the page is open, so an unreduced scan can always catch a chat bubble
 * mid-fade and report 1.23:1 on text that is on its way to full contrast. WCAG
 * does not govern transient animation frames; settle time is covered by its own
 * test below.
 */
const scan = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
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
    await requireApproval(page);
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

test("interactive targets meet their size floor", async ({ page }) => {
  await page.goto("/");

  // Two tiers, because two different standards apply and conflating them is how
  // you end up either failing a real check or fudging the threshold.
  //
  // WCAG 2.2 AA (SC 2.5.8, Target Size Minimum) requires 24x24 CSS px. That is
  // the accessibility floor and it is non-negotiable for every control.
  //
  // 44px is the mobile-HIG comfort target, not a WCAG AA requirement. It is
  // applied to the actions inside the document, where mis-taps cost something.
  // The masthead and status-strip controls (theme, source, approval mode) are
  // secondary chrome, deliberately smaller so they do not compete with the
  // wordmark, and they clear the WCAG floor with room to spare.
  const measured = await page.evaluate(() => {
    const CHROME = ".theme-toggle, .source-link, .mode-toggle";
    return [...document.querySelectorAll("button, a[href], select, input[type=text], textarea")].map((el) => ({
      label: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40),
      height: Math.round(el.getBoundingClientRect().height),
      chrome: el.matches(CHROME),
    })).filter((x) => x.height > 0);
  });

  expect(measured.length).toBeGreaterThan(3);
  expect(measured.filter((x) => x.height < 24)).toEqual([]);
  expect(measured.filter((x) => !x.chrome && x.height < 44)).toEqual([]);
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
    // Perpetual decorative loops (hero idle drift, its LED) never finish by
    // design and are excluded — this measures one-shot entrance motion only.
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
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

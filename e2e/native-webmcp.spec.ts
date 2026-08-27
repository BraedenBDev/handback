import { expect, test, type Page } from "@playwright/test";

/**
 * The real WebMCP API, with no mock anywhere in sight.
 *
 * Every other spec in this directory installs a stand-in on
 * `document.modelContext`, which is fast and deterministic but can only ever be
 * as correct as my understanding of the platform. A parallel implementation of
 * this product shipped a mock that encoded the same mistake as its code and so
 * passed while registering nothing in a real browser.
 *
 * This file removes that failure mode. Chromium exposes the API behind
 * --enable-features=WebMCP, the same switch as chrome://flags/#enable-webmcp-testing.
 */

const call = (page: Page, name: string, input: unknown) =>
  page.evaluate(
    async ([toolName, payload]) => {
      const mc = (document as any).modelContext;
      const tools = await mc.getTools();
      const tool = tools.find((t: any) => t.name === toolName);
      const raw = JSON.parse(await mc.executeTool(tool, payload as string));
      if (raw?.structuredContent !== undefined) return raw.structuredContent;
      const text = raw?.content?.[0]?.text;
      if (typeof text !== "string") return raw;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
    [name, JSON.stringify(input)] as const,
  );

test("the browser really does expose WebMCP here", async ({ page }) => {
  await page.goto("/");
  const platform = await page.evaluate(() => ({
    document: typeof (document as any).modelContext,
    secureContext: window.isSecureContext,
    originKeyed: (window as any).originAgentCluster,
  }));
  // If this fails, every assertion below is meaningless, so it is checked first.
  expect(platform.document, "no native WebMCP: the --enable-features flag did not take").toBe("object");
  expect(platform.secureContext).toBe(true);
  expect(platform.originKeyed).toBe(true);
});

test("registers exactly the four staging tools against the real API", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  const names = await page.evaluate(async () =>
    (await (document as any).modelContext.getTools()).map((t: any) => t.name).sort(),
  );
  expect(names).toEqual(["get_handoff_receipt", "read_handoff", "stage_contribution", "stage_handoff"]);
  expect(names.some((n: string) => /approve|commit|publish|delete|revoke/.test(n))).toBe(false);
});

test("the real executeTool wants a RegisteredTool and a JSON string", async ({ page }) => {
  await page.goto("/");
  const shapes = await page.evaluate(async () => {
    const mc = (document as any).modelContext;
    const [tool] = await mc.getTools();
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return "accepted";
      } catch (e: any) {
        return `rejected: ${e.message}`;
      }
    };
    return {
      byName: await attempt(() => mc.executeTool(tool.name, "{}")),
      objectInput: await attempt(() => mc.executeTool(tool, {})),
      correct: await attempt(() => mc.executeTool(tool, "{}")),
    };
  });
  // These two rejections are the reason the README documents the convention.
  expect(shapes.byName).toMatch(/rejected/);
  expect(shapes.objectInput).toMatch(/rejected/);
  expect(shapes.correct).toBe("accepted");
});

test("an agent stages, a human approves, and only then is there a link", async ({ page }) => {
  await page.goto("/");

  const staged = await call(page, "stage_handoff", {
    objective: "Prove the native path end to end",
    summary: "Staged through the real document.modelContext, approved by a click.",
    tasks: [{ title: "Approve it", status: "todo" }],
  });
  expect(staged.status).toBe("staged_awaiting_human_approval");
  expect(await call(page, "get_handoff_receipt", {})).toMatchObject({ status: "pending" });
  await expect(page.getByText("Prove the native path end to end")).toBeVisible();

  await page.getByRole("button", { name: "Approve and create" }).click();
  await expect(page.locator("input.link")).toBeVisible();

  const receipt = await call(page, "get_handoff_receipt", {});
  expect(receipt.status).toBe("created");
  expect(receipt.url).toContain("#k=");
});

test("a second agent reads, proposes, and gets refused on a stale base", async ({ page }) => {
  await page.goto("/");
  await call(page, "stage_handoff", {
    objective: "Native round trip",
    summary: "First version.",
    tasks: [{ title: "Hand it over", status: "in_progress" }],
  });
  await page.getByRole("button", { name: "Approve and create" }).click();
  const url = await page.locator("input.link").inputValue();

  const second = await page.context().newPage();
  await second.goto(url);
  await expect(second.getByText("Native round trip")).toBeVisible();

  const read = await call(second, "read_handoff", { sections: ["objective", "tasks"] });
  expect(read.objective).toBe("Native round trip");
  expect(JSON.stringify(read)).not.toContain(url.split("#k=")[1]);

  // A refusal has to arrive as a value: the platform discards thrown reasons.
  const stale = await call(second, "stage_contribution", {
    baseVersion: 99,
    note: "stale",
    operations: [{ op: "add_task", value: "nope" }],
  });
  expect(stale).toMatchObject({ status: "refused", reason: "stale_base", currentVersion: 1 });

  const good = await call(second, "stage_contribution", {
    baseVersion: stale.currentVersion,
    note: "Marking it done",
    operations: [{ op: "set_task_status", value: "Hand it over", status: "done" }],
  });
  expect(good.status).toBe("staged_awaiting_human_approval");
  await second.getByRole("button", { name: "Approve contribution" }).click();
  await expect(second.locator(".seal .seal-version")).toHaveText("v2");
});

test("a section too large for one response comes back paged, not dropped", async ({ page }) => {
  await page.goto("/");
  const longSummary = "S".repeat(4000);
  await call(page, "stage_handoff", { objective: "Paging", summary: longSummary });
  await page.getByRole("button", { name: "Approve and create" }).click();
  const url = await page.locator("input.link").inputValue();

  const reader = await page.context().newPage();
  await reader.goto(url);
  await expect(reader.getByText("Paging")).toBeVisible();

  let offset = 0;
  let assembled = "";
  for (let guard = 0; guard < 20; guard++) {
    const chunk: any = await call(reader, "read_handoff", { sections: ["summary"], offset });
    expect(chunk.summary, "a section was dropped instead of paged").toBeTruthy();
    assembled += chunk.summary;
    if (chunk.complete !== false) break;
    offset = chunk.nextOffset;
  }
  expect(assembled).toBe(longSummary);
});

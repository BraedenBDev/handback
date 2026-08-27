import { expect, test, type Page } from "@playwright/test";

/**
 * The mock installs ONLY `document.modelContext`, and never touches `window`.
 *
 * That is deliberate and is the point of this file. A parallel implementation of
 * Handback read `window.modelContext`, registered nothing in a real browser, and
 * shipped green because its own test mocked `window` too — the test encoded the
 * same mistake as the code and could only ever confirm it. Anchoring the mock to
 * `document` means a regression to `window` fails here instead of at a judge's desk.
 *
 * It also mirrors the real calling convention, verified against Chrome 149 on
 * 2026-08-27: executeTool takes the RegisteredTool object returned by getTools(),
 * the input is a JSON string rather than an object, and a thrown error is
 * flattened into a useless generic message — which is why our tools return
 * refusals instead of throwing.
 */
async function installWebMcp(page: Page) {
  await page.addInitScript(() => {
    const registered: any[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: any) {
          if (registered.some((t) => t.name === tool.name)) {
            throw new Error(`Tool already registered: ${tool.name}`);
          }
          registered.push(tool);
          return Promise.resolve();
        },
        getTools: () => Promise.resolve(registered),
        executeTool: async (tool: any, input: string) => {
          if (typeof input !== "string") throw new Error("Failed to parse input arguments");
          const found = registered.find((t) => t.name === tool?.name);
          if (!found) throw new Error("The provided value is not of type 'RegisteredTool'");
          try {
            return JSON.stringify(await found.execute(JSON.parse(input)));
          } catch {
            throw new Error("Tool was executed but the invocation failed");
          }
        },
      },
    });
  });
}

const callTool = (page: Page, name: string, input: unknown) =>
  page.evaluate(
    async ([toolName, payload]) => {
      const mc = (document as any).modelContext;
      const tools = await mc.getTools();
      const tool = tools.find((t: any) => t.name === toolName);
      return JSON.parse(await mc.executeTool(tool, payload as string));
    },
    [name, JSON.stringify(input)] as const,
  );

const listTools = (page: Page) =>
  page.evaluate(async () => {
    const mc = (document as any).modelContext;
    return mc ? (await mc.getTools()).map((t: any) => t.name).sort() : [];
  });

test("registers exactly the four staging tools, and no approve or commit tool", async ({ page }) => {
  await installWebMcp(page);
  await page.goto("/");
  await expect(page.getByText("WebMCP tools registered")).toBeVisible();

  const tools = await listTools(page);
  expect(tools).toEqual(["get_handoff_receipt", "read_handoff", "stage_contribution", "stage_handoff"]);
  // The consent boundary, asserted rather than assumed.
  expect(tools.some((n: string) => /approve|commit|publish|delete|revoke/.test(n))).toBe(false);
});

test("an agent stages, a human approves, and only then does a link exist", async ({ page }) => {
  await installWebMcp(page);
  await page.goto("/");

  const staged = await callTool(page, "stage_handoff", {
    objective: "Prove the browser path end to end",
    summary: "Staged by a tool call, approved by a click.",
    tasks: [{ title: "Approve it", status: "todo" }],
  });
  expect(staged.status).toBe("staged_awaiting_human_approval");

  // Nothing exists until a human acts.
  expect((await callTool(page, "get_handoff_receipt", {})).status).toBe("pending");
  await expect(page.getByText("Prove the browser path end to end")).toBeVisible();

  await page.getByRole("button", { name: "Approve and create" }).click();
  await expect(page.locator("input.link")).toBeVisible();

  const receipt = await callTool(page, "get_handoff_receipt", {});
  expect(receipt.status).toBe("created");
  expect(receipt.url).toContain("#k=");
});

test("a second agent reads the handoff, contributes, and a human approves", async ({ page }) => {
  await installWebMcp(page);
  await page.goto("/");
  await callTool(page, "stage_handoff", {
    objective: "Round trip",
    summary: "First version.",
    tasks: [{ title: "Hand it over", status: "in_progress" }],
  });
  await page.getByRole("button", { name: "Approve and create" }).click();
  const url = await page.locator("input.link").inputValue();

  // A different page, holding nothing but the link.
  const second = await page.context().newPage();
  await installWebMcp(second);
  await second.goto(url);
  await expect(second.getByText("Round trip")).toBeVisible();

  const read = await callTool(second, "read_handoff", { sections: ["objective", "tasks"] });
  expect(read.objective).toBe("Round trip");
  expect(read.version).toBe(1);
  // read_handoff must never hand the key back to the agent.
  expect(JSON.stringify(read)).not.toContain(url.split("#k=")[1]);

  // A stale base is refused as a VALUE, so the agent can recover on its own.
  const stale = await callTool(second, "stage_contribution", {
    baseVersion: 99,
    note: "stale",
    operations: [{ op: "add_task", value: "nope" }],
  });
  expect(stale).toMatchObject({ status: "refused", reason: "stale_base", currentVersion: 1 });

  const good = await callTool(second, "stage_contribution", {
    baseVersion: stale.currentVersion,
    note: "Marking it done",
    operations: [{ op: "set_task_status", value: "Hand it over", status: "done" }],
  });
  expect(good.status).toBe("staged_awaiting_human_approval");

  await second.getByRole("button", { name: "Approve contribution" }).click();
  await expect(second.getByText("Version 2")).toBeVisible();

  // The ORIGINAL link still opens. This is the regression that sank the first build.
  const third = await page.context().newPage();
  await installWebMcp(third);
  await third.goto(url);
  await expect(third.getByText("Version 2")).toBeVisible();
  await expect(third.getByText("Marking it done")).toBeVisible();
});

test("without WebMCP the page still works by hand", async ({ page }) => {
  await page.goto("/"); // no mock installed
  await expect(page.getByText("WebMCP not detected")).toBeVisible();
  await page.getByLabel("Objective").fill("Typed by a human");
  await page.getByLabel("Where the work stands").fill("No agent involved.");
  await page.getByRole("button", { name: "Stage handoff" }).click();
  await page.getByRole("button", { name: "Approve and create" }).click();
  await expect(page.locator("input.link")).toBeVisible();
});

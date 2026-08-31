// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampForAgent, isWebMcpAvailable, isWebMcpFallback, registerHandbackTools, toToolResult, type WebMcpBridge } from "../src/webmcp.ts";
import { HANDOFF_STATE_SCHEMA, CONTRIBUTION_SCHEMA } from "../shared/schema.ts";
import { unwrap } from "./tool-result.ts";

/**
 * Cross-client compatibility, asserted against what the specs and shipped
 * implementations actually say rather than against the one browser this was
 * developed in. Each block cites the source it encodes.
 */

function fakeContext() {
  const registered: any[] = [];
  return {
    registered,
    context: {
      registerTool(tool: any, _options?: { signal?: AbortSignal; exposedTo?: string[] }) {
        if (registered.some((t) => t.name === tool.name)) {
          const error = new Error(`Tool already registered: ${tool.name}`);
          error.name = "InvalidStateError";
          return Promise.reject(error);
        }
        registered.push(tool);
        return Promise.resolve();
      },
      getTools: () => Promise.resolve(registered),
      executeTool: async () => "{}",
    },
  };
}

const bridge = (overrides: Partial<WebMcpBridge> = {}): WebMcpBridge => ({
  readSettings: () => ({ requireApproval: false, retentionDays: 7 }),
  writeSettings: () => ({ requireApproval: false, retentionDays: 7 }),
  stageHandoff: vi.fn(),
  getReceipt: () => ({ status: "pending" }),
  readHandoff: () => ({ objective: "o", version: 1 }),
  stageContribution: () => ({ status: "staged", baseVersion: 1, operationCount: 1 }),
  ...overrides,
});

afterEach(() => {
  delete (document as any).modelContext;
  delete (navigator as any).modelContext;
  delete (window as any).agent;
  vi.restoreAllMocks();
});

describe("entry point, across every place it has lived", () => {
  // webmachinelearning/webmcp PR #184 (2026-05-27) moved the getter from
  // Navigator to Document. Both names are live in the wild.
  it("registers on document.modelContext, the canonical location", async () => {
    const { registered, context } = fakeContext();
    (document as any).modelContext = context;
    await registerHandbackTools(bridge());
    expect(registered).toHaveLength(5);
  });

  it("falls back to navigator.modelContext, which Brave and the official polyfill still expose", async () => {
    const { registered, context } = fakeContext();
    (navigator as any).modelContext = context;
    expect(isWebMcpAvailable()).toBe(true);
    await registerHandbackTools(bridge());
    expect(registered).toHaveLength(5);
  });

  it("prefers document when a host exposes both", async () => {
    const preferred = fakeContext();
    const deprecated = fakeContext();
    (document as any).modelContext = preferred.context;
    (navigator as any).modelContext = deprecated.context;
    await registerHandbackTools(bridge());
    expect(preferred.registered).toHaveLength(5);
    expect(deprecated.registered).toHaveLength(0);
  });

  it("ignores a placeholder object that has no registerTool", async () => {
    // Angular's DOM-clobbering guard: <form id="modelContext"> makes
    // document.modelContext a truthy Element rather than a ModelContext.
    (document as any).modelContext = { getTools: () => [] };
    expect(isWebMcpAvailable()).toBe(false);
    vi.useFakeTimers();
    try {
      const pending = registerHandbackTools(bridge());
      await vi.advanceTimersByTimeAsync(2_000);
      await pending;
      // The clobbered property is replaced rather than trusted, and the browser
      // is still correctly reported as having no WebMCP of its own.
      expect(isWebMcpAvailable()).toBe(false);
      expect(isWebMcpFallback()).toBe(true);
      expect((await (document as any).modelContext.getTools()).length).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fall back to window.agent, a name abandoned in 2025 that never shipped", async () => {
    const { registered, context } = fakeContext();
    (window as any).agent = context;
    expect(isWebMcpAvailable()).toBe(false);
    expect(registered).toHaveLength(0);
  });

  it("installs its own registry when there is no WebMCP at all", async () => {
    // The ChatGPT agent-mode case: a sandboxed Chromium with no origin trial
    // and no extension. Before the fallback existed, an agent told exactly
    // where to look found document.modelContext undefined and gave up.
    expect(isWebMcpAvailable()).toBe(false);
    vi.useFakeTimers();
    try {
      const pending = registerHandbackTools(bridge());
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.not.toBeNull();
      expect(isWebMcpAvailable()).toBe(false); // the browser still has none
      expect(isWebMcpFallback()).toBe(true); // but the tools are reachable
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tool descriptors obey the documented constraints", () => {
  async function descriptors() {
    const { registered, context } = fakeContext();
    (document as any).modelContext = context;
    await registerHandbackTools(bridge());
    return registered;
  }

  // index.bs: name length 1..128, ASCII alphanumeric plus _ - . only.
  // Violating this rejects registerTool with InvalidStateError.
  it("uses names the spec will actually accept", async () => {
    for (const tool of await descriptors()) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.name.length).toBeLessThanOrEqual(128);
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]+$/);
    }
  });

  // developer.chrome.com/docs/ai/webmcp/secure-tools recommends 30 / 500 / 150.
  it("stays inside Chrome's guidance for name and description length", async () => {
    for (const tool of await descriptors()) {
      expect(tool.name.length, `${tool.name} name`).toBeLessThanOrEqual(30);
      expect(tool.description.length, `${tool.name} description`).toBeLessThanOrEqual(500);
      expect(tool.description.length, `${tool.name} description is empty`).toBeGreaterThan(0);
    }
  });

  it("keeps every parameter description inside the 150 character guidance", () => {
    const overLimit: string[] = [];
    const walk = (schema: any, path: string) => {
      if (!schema || typeof schema !== "object") return;
      if (typeof schema.description === "string" && schema.description.length > 150) {
        overLimit.push(`${path} (${schema.description.length})`);
      }
      for (const [key, value] of Object.entries(schema.properties ?? {})) walk(value, `${path}.${key}`);
      if (schema.items) walk(schema.items, `${path}[]`);
    };
    walk(HANDOFF_STATE_SCHEMA, "stage_handoff");
    walk(CONTRIBUTION_SCHEMA, "stage_contribution");
    expect(overLimit).toEqual([]);
  });

  // WebMCP's ToolAnnotations dictionary has exactly two members. MCP core's
  // extra hints (destructiveHint, idempotentHint, openWorldHint) are not part
  // of it and would be dropped.
  it("uses only the two annotations WebMCP defines", async () => {
    for (const tool of await descriptors()) {
      for (const key of Object.keys(tool.annotations ?? {})) {
        expect(["readOnlyHint", "untrustedContentHint"]).toContain(key);
      }
    }
  });

  it("declares an inputSchema that survives JSON.stringify", async () => {
    // registerTool rejects with TypeError if the schema cannot be serialised.
    for (const tool of await descriptors()) {
      expect(() => JSON.stringify(tool.inputSchema)).not.toThrow();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("passes an AbortSignal so the tools can be unregistered", async () => {
    const { context } = fakeContext();
    const spy = vi.spyOn(context, "registerTool");
    (document as any).modelContext = context;
    const controller = await registerHandbackTools(bridge());
    for (const call of spy.mock.calls) {
      expect((call[1] as any)?.signal).toBeInstanceOf(AbortSignal);
    }
    controller!.abort();
  });
});

describe("failures are returned, never thrown", () => {
  // index.bs discards the rejection reason and hands the caller a bare
  // UnknownError; Chrome flattens it to a generic message. An agent cannot act
  // on either, so every refusal has to be a value.
  it("every tool resolves rather than rejecting, even in the wrong page state", async () => {
    const { registered, context } = fakeContext();
    (document as any).modelContext = context;
    await registerHandbackTools(
      bridge({
        stageHandoff: () => ({ status: "refused", reason: "wrong_page", message: "no" }),
        stageContribution: () => ({ status: "refused", reason: "wrong_page", message: "no" }),
        readHandoff: () => ({ error: "nothing open" }),
      }),
    );

    const inputs: Record<string, unknown> = {
      stage_handoff: { objective: "o", summary: "s" },
      get_handoff_receipt: {},
      read_handoff: { sections: ["objective"] },
      stage_contribution: { baseVersion: 1, note: "n", operations: [{ op: "add_task", value: "v" }] },
    };

    for (const tool of registered) {
      const result = await tool.execute(inputs[tool.name]);
      expect(result, `${tool.name} returned nothing`).toBeTruthy();
      expect(() => JSON.stringify(result), `${tool.name} result is not serialisable`).not.toThrow();
    }
  });

  it("passes a wrong-page refusal through with its explanation intact", async () => {
    const { registered, context } = fakeContext();
    (document as any).modelContext = context;
    await registerHandbackTools(
      bridge({ stageHandoff: () => ({ status: "refused", reason: "wrong_page", message: "Open a handoff link first." }) }),
    );
    const result = unwrap(await registered.find((t) => t.name === "stage_handoff")!.execute({ objective: "o", summary: "s" }));
    expect(result).toMatchObject({ status: "refused", reason: "wrong_page" });
    expect(result.message).toMatch(/Open a handoff link/);
  });

  it("keeps registering the remaining tools when one registration rejects", async () => {
    const { registered, context } = fakeContext();
    // Pre-claim a name so its registration rejects with InvalidStateError.
    registered.push({ name: "read_handoff" });
    (document as any).modelContext = context;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await registerHandbackTools(bridge());
    const names = registered.map((t) => t.name);
    expect(names).toContain("stage_handoff");
    expect(names).toContain("get_handoff_receipt");
    expect(names).toContain("stage_contribution");
  });
});

describe("output stays inside the documented budget", () => {
  // Chrome guidance: ~1.5K characters per tool output. The schema permits a
  // handoff far larger than that, and silent truncation elsewhere would hand
  // an agent a partial read it believes is complete.
  const hugeHandoff = {
    version: 3,
    objective: "x".repeat(600),
    summary: "y".repeat(4000),
    sources: Array.from({ length: 100 }, (_, i) => ({ title: `Source ${i}`, url: "https://example.com/" + "z".repeat(60) })),
  };

  it("clamps an oversized read to the budget", () => {
    const clamped = clampForAgent(hugeHandoff) as any;
    expect(JSON.stringify(clamped).length).toBeLessThanOrEqual(1500);
  });

  it("says plainly that it truncated, and what it dropped", () => {
    const clamped = clampForAgent(hugeHandoff) as any;
    expect(clamped.truncated).toBe(true);
    expect(clamped.droppedSections.length).toBeGreaterThan(0);
    expect(clamped.note).toMatch(/read_handoff again/);
  });

  it("always keeps the version, so the agent can still propose against it", () => {
    expect((clampForAgent(hugeHandoff) as any).version).toBe(3);
  });

  it("leaves a small read completely untouched", () => {
    const small = { version: 1, objective: "Ship it" };
    expect(clampForAgent(small)).toEqual(small);
  });

  it("passes an error result through without mangling it", () => {
    expect(clampForAgent({ error: "nothing open" })).toEqual({ error: "nothing open" });
  });
});

describe("results are shaped for clients that expect MCP content blocks", () => {
  // Chrome's own demos return bare objects and the spec accepts anything
  // JSON-serialisable, but every wrapper written for reuse across unknown
  // clients — Google's use-webmcp-tool, @mcp-b/webmcp-polyfill, MCPCat,
  // vue-webmcp — converges on content blocks. This page does not know which
  // agent is reading it, so it normalises too.
  it("wraps a message result in a text content block, keeping the data structured", () => {
    const result = toToolResult({ status: "refused", message: "Open a handoff link first." }) as any;
    expect(result.content).toEqual([{ type: "text", text: "Open a handoff link first." }]);
    expect(result.structuredContent).toMatchObject({ status: "refused" });
  });

  it("serialises a data-only result into the text block without duplicating it", () => {
    const result = toToolResult({ version: 2, objective: "Ship" }) as any;
    expect(JSON.parse(result.content[0].text)).toEqual({ version: 2, objective: "Ship" });
    // No structuredContent here: it would double the payload against the budget.
    expect(result.structuredContent).toBeUndefined();
  });

  it("passes an already MCP-shaped value straight through", () => {
    const already = { content: [{ type: "text", text: "done" }], isError: false };
    expect(toToolResult(already)).toBe(already);
  });

  it("keeps a clamped read inside the output budget after wrapping", () => {
    const huge = { version: 1, summary: "y".repeat(9000), sources: Array.from({ length: 100 }, () => ({ title: "t", url: "u" })) };
    const wrapped = toToolResult(clampForAgent(huge));
    expect(JSON.stringify(wrapped).length).toBeLessThanOrEqual(2200);
  });
});

describe("an API injected after mount is still picked up", () => {
  // Extension-based clients install modelContext from a content script, which
  // can land after this page has already concluded WebMCP is absent.
  it("waits for a late injection and then registers", async () => {
    vi.useFakeTimers();
    try {
      const { registered, context } = fakeContext();
      const pending = registerHandbackTools(bridge());
      expect(registered).toHaveLength(0);

      (document as any).modelContext = context;
      await vi.advanceTimersByTimeAsync(600);
      await pending;
      expect(registered).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adopts a host that arrives after the fallback is already installed", async () => {
    // An extension that checks `if (!document.modelContext)` would find OUR
    // object and back off, so its bridge would expose nothing. Installing the
    // fallback must not end the search.
    vi.useFakeTimers();
    try {
      const pending = registerHandbackTools(bridge());
      await vi.advanceTimersByTimeAsync(2_000);
      await pending;
      expect(isWebMcpFallback()).toBe(true);

      const { registered, context } = fakeContext();
      (document as any).modelContext = context;
      await vi.advanceTimersByTimeAsync(600);
      expect(registered).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops watching after ten seconds rather than polling forever", async () => {
    vi.useFakeTimers();
    try {
      const pending = registerHandbackTools(bridge());
      await vi.advanceTimersByTimeAsync(2_000);
      await pending;
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(11_000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the fallback registry speaks the same protocol as Chrome", () => {
  /** Installs the fallback and hands back whatever landed on the document. */
  async function installed() {
    vi.useFakeTimers();
    try {
      const pending = registerHandbackTools(bridge());
      await vi.advanceTimersByTimeAsync(2_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
    return (document as any).modelContext;
  }

  it("lists the same five tools, with their schemas intact", async () => {
    const tools = await (await installed()).getTools();
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      "get_handoff_receipt", "handback_settings", "read_handoff", "stage_contribution", "stage_handoff",
    ]);
    for (const tool of tools) expect(tool.inputSchema).toBeTruthy();
  });

  it("executes with Chrome's convention: the tool object and a JSON string", async () => {
    const context = await installed();
    const tools = await context.getTools();
    const receipt = tools.find((t: any) => t.name === "get_handoff_receipt");
    const raw = await context.executeTool(receipt, JSON.stringify({}));
    // A string back, exactly as Chrome 149 returns it.
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw)).toHaveProperty("content");
  });

  it("also accepts a bare tool name and an already-parsed object", async () => {
    // Divergence from Chrome, on purpose. An agent that reaches for the obvious
    // shape should get an answer rather than a type error it cannot interpret.
    const context = await installed();
    const raw = await context.executeTool("get_handoff_receipt", { });
    expect(JSON.parse(raw)).toHaveProperty("content");
    expect(JSON.parse(await context.executeTool("get_handoff_receipt"))).toHaveProperty("content");
  });

  it("names the tool it could not find, instead of a generic type error", async () => {
    const context = await installed();
    await expect(context.executeTool("no_such_tool", "{}")).rejects.toThrow(/no_such_tool/);
  });

  it("removes its tools when the page tears the registration down", async () => {
    vi.useFakeTimers();
    let controller;
    try {
      const pending = registerHandbackTools(bridge());
      await vi.advanceTimersByTimeAsync(2_000);
      controller = await pending;
    } finally {
      vi.useRealTimers();
    }
    const context = (document as any).modelContext;
    expect((await context.getTools()).length).toBe(5);
    controller!.abort();
    expect((await context.getTools()).length).toBe(0);
  });
});

describe("a long section can still be read, one page at a time", () => {
  /**
   * The regression a real ChatGPT session hit: `summary` may be 4,000
   * characters, so under a 1,500 character budget it could never fit, was
   * dropped every time, and the agent abandoned the tool and scraped the
   * rendered page instead. A reader that silently cannot return a field is
   * worse than no reader.
   */
  const longSummary = "S".repeat(4000);

  it("returns an oversized single section instead of dropping it", () => {
    const page = clampForAgent({ version: 1, summary: longSummary }) as any;
    expect(page.summary).toBeTruthy();
    expect(page.summary.length).toBeGreaterThan(500);
    expect(page.droppedSections).toBeUndefined();
  });

  it("says exactly where to resume", () => {
    const page = clampForAgent({ version: 1, summary: longSummary }) as any;
    expect(page.complete).toBe(false);
    expect(page.nextOffset).toBe(page.summary.length);
    expect(page.totalLength).toBe(4000);
    expect(page.note).toMatch(/offset:\d+/);
  });

  it("reassembles into the original when paged through", () => {
    let offset = 0;
    let assembled = "";
    for (let guard = 0; guard < 20; guard++) {
      const page = clampForAgent({ version: 1, summary: longSummary }, offset) as any;
      assembled += page.summary;
      if (page.complete !== false) break;
      offset = page.nextOffset;
    }
    expect(assembled).toBe(longSummary);
  });

  it("marks the final page complete", () => {
    const page = clampForAgent({ version: 1, summary: longSummary }, 3900) as any;
    expect(page.complete).toBe(true);
    expect(page.summary).toBe("S".repeat(100));
  });

  it("keeps every page inside the budget once wrapped", () => {
    const wrapped = toToolResult(clampForAgent({ version: 1, summary: longSummary }));
    expect(JSON.stringify(wrapped).length).toBeLessThanOrEqual(1500);
  });

  it("still names dropped sections when several were asked for at once", () => {
    const many = clampForAgent({
      version: 1, summary: longSummary, objective: "o".repeat(600), handoffNote: "n".repeat(2000),
    }) as any;
    expect(many.truncated).toBe(true);
    expect(many.droppedSections.length).toBeGreaterThan(0);
    expect(many.note).toMatch(/single section at a time/);
  });
});

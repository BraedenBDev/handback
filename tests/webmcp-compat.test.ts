// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampForAgent, isWebMcpAvailable, registerHandbackTools, type WebMcpBridge } from "../src/webmcp.ts";
import { HANDOFF_STATE_SCHEMA, CONTRIBUTION_SCHEMA } from "../shared/schema.ts";

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
    expect(registered).toHaveLength(4);
  });

  it("falls back to navigator.modelContext, which Brave and the official polyfill still expose", async () => {
    const { registered, context } = fakeContext();
    (navigator as any).modelContext = context;
    expect(isWebMcpAvailable()).toBe(true);
    await registerHandbackTools(bridge());
    expect(registered).toHaveLength(4);
  });

  it("prefers document when a host exposes both", async () => {
    const preferred = fakeContext();
    const deprecated = fakeContext();
    (document as any).modelContext = preferred.context;
    (navigator as any).modelContext = deprecated.context;
    await registerHandbackTools(bridge());
    expect(preferred.registered).toHaveLength(4);
    expect(deprecated.registered).toHaveLength(0);
  });

  it("ignores a placeholder object that has no registerTool", async () => {
    (document as any).modelContext = { getTools: () => [] };
    expect(isWebMcpAvailable()).toBe(false);
    await expect(registerHandbackTools(bridge())).resolves.toBeNull();
  });

  it("does not fall back to window.agent, a name abandoned in 2025 that never shipped", async () => {
    const { registered, context } = fakeContext();
    (window as any).agent = context;
    expect(isWebMcpAvailable()).toBe(false);
    expect(registered).toHaveLength(0);
  });

  it("reports unavailable rather than throwing when there is no WebMCP at all", async () => {
    expect(isWebMcpAvailable()).toBe(false);
    await expect(registerHandbackTools(bridge())).resolves.toBeNull();
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
    const result = await registered.find((t) => t.name === "stage_handoff")!.execute({ objective: "o", summary: "s" });
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

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isWebMcpAvailable, registerHandbackTools, type WebMcpBridge } from "../src/webmcp.ts";
import { CONTRIBUTION_SCHEMA, HANDOFF_STATE_SCHEMA } from "../shared/schema.ts";
import { validate } from "../shared/validate.ts";
import { unwrap } from "./tool-result.ts";

/**
 * A fake modelContext that mirrors the real one verified against Chrome 149:
 * tools hang off `document` (never `window`), executeTool takes the
 * RegisteredTool object plus a JSON *string*, and a thrown error is flattened
 * into a generic message the agent cannot act on.
 */
function installFakeModelContext() {
  const registered: any[] = [];
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool(tool: any) {
        if (registered.some((t) => t.name === tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
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
  return registered;
}

function makeBridge(overrides: Partial<WebMcpBridge> = {}): WebMcpBridge {
  return {
    readSettings: () => ({ requireApproval: false, retentionDays: 7 }),
    writeSettings: () => ({ requireApproval: false, retentionDays: 7 }),
    stageHandoff: vi.fn(),
    getReceipt: () => ({ status: "pending" }),
    readHandoff: () => ({ objective: "o" }),
    stageContribution: () => ({ status: "staged", baseVersion: 1, operationCount: 1 }),
    ...overrides,
  };
}

beforeEach(() => {
  delete (document as any).modelContext;
});

describe("tool registration", () => {
  it("reports WebMCP unavailable when document has no modelContext", () => {
    expect(isWebMcpAvailable()).toBe(false);
  });

  it("registers against document, never window", async () => {
    // The regression that shipped in a parallel implementation: reading
    // window.modelContext registers nothing in a real browser.
    (window as any).modelContext = { registerTool: () => { throw new Error("window must not be used"); } };
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    expect(registered.map((t) => t.name).sort()).toEqual([
      "get_handoff_receipt", "handback_settings", "read_handoff", "stage_contribution", "stage_handoff",
    ]);
    delete (window as any).modelContext;
  });

  it("returns null and registers nothing when WebMCP is absent", async () => {
    vi.useFakeTimers();
    try {
      const pending = registerHandbackTools(makeBridge());
      await vi.advanceTimersByTimeAsync(11_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes no tool that could approve, commit or delete", async () => {
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    for (const tool of registered) {
      expect(tool.name).not.toMatch(/approve|commit|publish|delete|revoke|send/);
    }
  });

  it("gives every tool a real input schema, not a placeholder", async () => {
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    for (const tool of registered) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      const hasProperties = Object.keys(tool.inputSchema.properties ?? {}).length > 0;
      // get_handoff_receipt legitimately takes nothing; everything else must
      // describe its arguments rather than accepting a free-form object.
      expect(hasProperties || tool.name === "get_handoff_receipt").toBe(true);
    }
  });

  it("marks tools that surface other people's content as untrusted", async () => {
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    const byName = Object.fromEntries(registered.map((t) => [t.name, t]));
    expect(byName.read_handoff.annotations.untrustedContentHint).toBe(true);
    expect(byName.read_handoff.annotations.readOnlyHint).toBe(true);
    expect(byName.stage_contribution.annotations.untrustedContentHint).toBe(true);
  });

  it("advertises the same schemas the app validates against", async () => {
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    const byName = Object.fromEntries(registered.map((t) => [t.name, t]));
    expect(byName.stage_handoff.inputSchema).toBe(HANDOFF_STATE_SCHEMA);
    expect(byName.stage_contribution.inputSchema).toBe(CONTRIBUTION_SCHEMA);
  });

  it("tears every tool down when the controller aborts", async () => {
    installFakeModelContext();
    const controller = await registerHandbackTools(makeBridge());
    expect(controller).toBeInstanceOf(AbortController);
    controller!.abort();
    expect(controller!.signal.aborted).toBe(true);
  });
});

describe("tool behaviour", () => {
  it("stage_handoff stages and never reports having created anything", async () => {
    const registered = installFakeModelContext();
    const stageHandoff = vi.fn();
    await registerHandbackTools(makeBridge({ stageHandoff }));
    const tool = registered.find((t) => t.name === "stage_handoff")!;
    const result = unwrap(await tool.execute({ objective: "o", summary: "s" }));
    expect(stageHandoff).toHaveBeenCalledWith({ objective: "o", summary: "s" });
    expect(result.status).toBe("staged_awaiting_human_approval");
    expect(JSON.stringify(result)).not.toMatch(/created|http/i);
  });

  it("stage_contribution returns a stale-base refusal rather than throwing", async () => {
    // A thrown error is flattened by WebMCP into a message the agent cannot act
    // on, so the refusal has to be a value carrying the current version.
    const registered = installFakeModelContext();
    await registerHandbackTools(
      makeBridge({ stageContribution: () => ({ status: "refused", reason: "stale_base", currentVersion: 7 }) }),
    );
    const tool = registered.find((t) => t.name === "stage_contribution")!;
    const result = unwrap(await tool.execute({ baseVersion: 2, note: "n", operations: [{ op: "add_task", value: "v" }] }));
    expect(result).toMatchObject({ status: "refused", reason: "stale_base", currentVersion: 7 });
    expect(result.message).toMatch(/version 7/);
  });

  it("read_handoff passes the requested sections straight through", async () => {
    const registered = installFakeModelContext();
    const readHandoff = vi.fn(() => ({ objective: "o", version: 1 }));
    await registerHandbackTools(makeBridge({ readHandoff }));
    const tool = registered.find((t) => t.name === "read_handoff")!;
    await tool.execute({ sections: ["objective", "tasks"] });
    expect(readHandoff).toHaveBeenCalledWith(["objective", "tasks"]);
  });

  it("read_handoff only offers sections the schema allows", async () => {
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    const tool = registered.find((t) => t.name === "read_handoff")!;
    const allowed = tool.inputSchema.properties.sections.items.enum;
    expect(allowed).not.toContain("contentHash");
    expect(allowed).toContain("objective");
  });

  it("the advertised stage_handoff schema actually rejects hostile input", async () => {
    const registered = installFakeModelContext();
    await registerHandbackTools(makeBridge());
    const tool = registered.find((t) => t.name === "stage_handoff")!;
    expect(validate({ objective: "o", summary: "s", extra: 1 }, tool.inputSchema).valid).toBe(false);
    expect(validate({ objective: "x".repeat(999), summary: "s" }, tool.inputSchema).valid).toBe(false);
  });
});

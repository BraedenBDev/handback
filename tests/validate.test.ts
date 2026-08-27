import { describe, expect, it } from "vitest";
import { validate } from "../shared/validate.ts";
import {
  CONTRIBUTION_SCHEMA,
  ENVELOPE_SCHEMA,
  HANDOFF_STATE_SCHEMA,
} from "../shared/schema.ts";

/**
 * This validator replaced Ajv, so it is now load-bearing on the server's trust
 * boundary. It gets hostile input, not happy paths.
 */

const validState = { objective: "Ship", summary: "Going well." };
const validEnvelope = { format: "handback-aes256gcm-v1", iv: "AAAA", ciphertext: "ZmFrZQ" };

describe("happy paths still pass", () => {
  it("accepts a minimal state", () => {
    expect(validate(validState, HANDOFF_STATE_SCHEMA).valid).toBe(true);
  });

  it("accepts a fully populated state", () => {
    const full = {
      ...validState,
      decisions: [{ decision: "d", rationale: "r" }],
      constraints: [{ kind: "must", text: "t" }],
      openQuestions: ["q"],
      tasks: [{ title: "t", status: "todo" }],
      sources: [{ title: "s", url: "https://example.com" }],
      handoffNote: "n",
    };
    expect(validate(full, HANDOFF_STATE_SCHEMA)).toEqual({ valid: true });
  });

  it("accepts a valid envelope", () => {
    expect(validate(validEnvelope, ENVELOPE_SCHEMA).valid).toBe(true);
  });
});

describe("rejects what the schema forbids", () => {
  it("rejects a missing required field", () => {
    const result = validate({ objective: "Ship" }, HANDOFF_STATE_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as any).errors.join(" ")).toMatch(/summary is required/);
  });

  it("rejects an unexpected property rather than ignoring it", () => {
    const result = validate({ ...validState, injected: "surprise" }, HANDOFF_STATE_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as any).errors.join(" ")).toMatch(/injected is not an allowed property/);
  });

  it("rejects __proto__ explicitly", () => {
    const hostile = JSON.parse('{"objective":"a","summary":"b","__proto__":{"polluted":true}}');
    const result = validate(hostile, HANDOFF_STATE_SCHEMA);
    expect(result.valid).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("rejects constructor and prototype keys", () => {
    for (const key of ["constructor", "prototype"]) {
      const hostile = JSON.parse(`{"objective":"a","summary":"b","${key}":{}}`);
      expect(validate(hostile, HANDOFF_STATE_SCHEMA).valid).toBe(false);
    }
  });

  it("enforces maxLength", () => {
    const result = validate({ objective: "x".repeat(601), summary: "ok" }, HANDOFF_STATE_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as any).errors.join(" ")).toMatch(/at most 600 characters/);
  });

  it("enforces maxItems", () => {
    const tasks = Array.from({ length: 101 }, () => ({ title: "t", status: "todo" }));
    expect(validate({ ...validState, tasks }, HANDOFF_STATE_SCHEMA).valid).toBe(false);
  });

  it("enforces minItems", () => {
    const result = validate({ baseVersion: 1, note: "n", operations: [] }, CONTRIBUTION_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as any).errors.join(" ")).toMatch(/at least 1 items/);
  });

  it("enforces enums", () => {
    const result = validate({ ...validState, tasks: [{ title: "t", status: "nearly" }] }, HANDOFF_STATE_SCHEMA);
    expect(result.valid).toBe(false);
    expect((result as any).errors.join(" ")).toMatch(/must be one of/);
  });

  it("enforces minimum on integers", () => {
    const result = validate(
      { baseVersion: 0, note: "n", operations: [{ op: "add_task", value: "v" }] },
      CONTRIBUTION_SCHEMA,
    );
    expect(result.valid).toBe(false);
  });

  it("distinguishes integer from float and from numeric string", () => {
    const base = { note: "n", operations: [{ op: "add_task", value: "v" }] };
    expect(validate({ ...base, baseVersion: 1.5 }, CONTRIBUTION_SCHEMA).valid).toBe(false);
    expect(validate({ ...base, baseVersion: "1" }, CONTRIBUTION_SCHEMA).valid).toBe(false);
    expect(validate({ ...base, baseVersion: 1 }, CONTRIBUTION_SCHEMA).valid).toBe(true);
  });

  it("rejects an array where an object is required", () => {
    expect(validate([], HANDOFF_STATE_SCHEMA).valid).toBe(false);
  });

  it("rejects null and primitives at the root", () => {
    for (const value of [null, 42, "text", true]) {
      expect(validate(value, HANDOFF_STATE_SCHEMA).valid).toBe(false);
    }
  });

  it("validates nested array items, not just the array", () => {
    const result = validate(
      { ...validState, decisions: [{ decision: "ok", rationale: "ok" }, { decision: "missing rationale" }] },
      HANDOFF_STATE_SCHEMA,
    );
    expect(result.valid).toBe(false);
    expect((result as any).errors.join(" ")).toMatch(/decisions\[1\]\.rationale is required/);
  });

  it("rejects extra keys smuggled into a nested item", () => {
    const result = validate(
      { ...validState, tasks: [{ title: "t", status: "todo", secret: "x" }] },
      HANDOFF_STATE_SCHEMA,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an envelope carrying plaintext-looking extras", () => {
    expect(validate({ ...validEnvelope, title: "Q3 pricing" }, ENVELOPE_SCHEMA).valid).toBe(false);
  });

  it("rejects a wrong envelope format string", () => {
    expect(validate({ ...validEnvelope, format: "rot13" }, ENVELOPE_SCHEMA).valid).toBe(false);
  });

  it("reports every problem at once, not just the first", () => {
    const result = validate({ objective: 1, summary: 2 }, HANDOFF_STATE_SCHEMA);
    expect((result as any).errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the validator fails loudly rather than silently under-checking", () => {
  it("throws on a schema keyword it does not implement", () => {
    expect(() => validate({}, { type: "object", patternProperties: {} })).toThrow(/does not implement/);
  });
});

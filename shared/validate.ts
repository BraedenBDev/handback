/**
 * A validator for the subset of JSON Schema this project actually uses.
 *
 * Why not Ajv: Ajv compiles validators by generating code, which breaks when
 * bundled for the browser (it threw `strict mode: unknown keyword "$schema"` at
 * module load and took the whole app down), and it cost ~100KB in the client
 * bundle to check one imported file. This walks the same schema literals from
 * schema.ts, so there is still exactly one source of truth shared by the WebMCP
 * tool definitions, the server, and the client.
 *
 * It is deliberately small and deliberately strict: anything it does not
 * understand is a programming error, not something to skip silently. The
 * hostile-input cases live in tests/validate.test.ts.
 */

export type Validation = { valid: true } | { valid: false; errors: string[] };

type Schema = Record<string, any>;

const KNOWN = new Set([
  "type", "properties", "required", "additionalProperties", "items", "enum",
  "maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum",
  "description", "uniqueItems",
]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function walk(value: unknown, schema: Schema, path: string, errors: string[]): void {
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN.has(keyword)) {
      // Loud rather than lenient: an unhandled keyword means this validator is
      // silently weaker than the schema claims, which is the dangerous failure.
      throw new Error(`validate.ts does not implement JSON Schema keyword "${keyword}" (at ${path || "root"})`);
    }
  }

  const at = path || "value";
  const actual = typeOf(value);

  if (schema.type) {
    const wanted = schema.type as string;
    const ok = wanted === "number" ? actual === "integer" || actual === "number" : actual === wanted;
    if (!ok) {
      errors.push(`${at} must be ${wanted}, got ${actual}`);
      return; // further checks would be noise
    }
  }

  if (schema.enum && !(schema.enum as unknown[]).includes(value)) {
    errors.push(`${at} must be one of: ${(schema.enum as unknown[]).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${at} must be at most ${schema.maxLength} characters (got ${value.length})`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${at} must be at least ${schema.minLength} characters`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at} must be at most ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${at} must have at most ${schema.maxItems} items (got ${value.length})`);
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at} must have at least ${schema.minItems} items`);
    }
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push(`${at} must not contain duplicates`);
    }
    if (schema.items) value.forEach((item, i) => walk(item, schema.items, `${at}[${i}]`, errors));
  }

  if (actual === "object" && schema.type === "object") {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;

    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in record) || record[key] === undefined) errors.push(`${at}.${key} is required`);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        // Prototype-polluting keys are rejected by the same rule that rejects
        // any other unexpected key, but call them out explicitly.
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          errors.push(`${at}.${key} is not allowed`);
          continue;
        }
        if (!(key in properties)) errors.push(`${at}.${key} is not an allowed property`);
      }
    }

    for (const [key, subSchema] of Object.entries(properties)) {
      if (key in record && record[key] !== undefined) walk(record[key], subSchema, `${at}.${key}`, errors);
    }
  }
}

export function validate(value: unknown, schema: Schema): Validation {
  const errors: string[] = [];
  walk(value, schema, "", errors);
  return errors.length ? { valid: false, errors } : { valid: true };
}

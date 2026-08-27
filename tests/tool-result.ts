/**
 * Reads a tool result the way a client would. Tools normalise their return to
 * MCP content blocks at the registration boundary, so assertions go through
 * here rather than reaching into the raw shape.
 */
export function unwrap(result: any): any {
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const text = result?.content?.[0]?.text;
  if (typeof text !== "string") return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

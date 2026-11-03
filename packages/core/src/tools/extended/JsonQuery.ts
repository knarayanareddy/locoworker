import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

/**
 * Read a value out of parsed JSON using a *restricted* path expression.
 *
 * The previous implementation compiled `return data.${input.query}` with
 * `new Function`, which let any model-supplied string execute arbitrary
 * JavaScript in the host process (file, env and network access). Only plain
 * property names and numeric array indexes are accepted here, and lookups
 * never walk the prototype chain.
 */
const SAFE_QUERY = /^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[\d+\]))*$/;
const BLOCKED_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export function queryJsonPath(data: unknown, query: string): unknown {
  if (typeof query !== "string" || !SAFE_QUERY.test(query)) {
    throw new Error(`Unsupported query "${String(query)}": only dot names and [n] indexes are allowed`);
  }
  const tokens = query.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+/g) ?? [];
  let current: unknown = data;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (BLOCKED_SEGMENTS.has(token)) {
      throw new Error(`Unsafe query segment "${token}"`);
    }
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) throw new Error(`Expected an array index, got "${token}"`);
      current = Object.prototype.hasOwnProperty.call(current, index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== "object") return undefined;
    const obj = current as Record<string, unknown>;
    current = Object.prototype.hasOwnProperty.call(obj, token) ? obj[token] : undefined;
  }
  return current;
}

export const JsonQuery: ToolDefinition = {
  name: "JsonQuery",
  description: "Extract data from a JSON string using a restricted dot-notation path (e.g. 'users[0].name' or 'items.length').",
  inputSchema: {
    type: "object",
    properties: {
      json: { type: "string" },
      query: { type: "string", description: "e.g. 'users[0].name' or 'items.length'" },
    },
    required: ["json", "query"],
    additionalProperties: false,
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { json: string; query: string }) {
    try {
      const data = JSON.parse(input.json);
      const result = queryJsonPath(data, input.query);
      return { content: JSON.stringify(result ?? null, null, 2), isError: false };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  },
};

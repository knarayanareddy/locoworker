import type { JSONSchema, ToolDefinition } from "../Tool.js";

/**
 * Runtime validation for tool inputs.
 *
 * `ToolDefinition.inputSchema` was previously sent to the provider but never
 * enforced locally: any JSON value (wrong types, missing required keys,
 * `__proto__`, extra properties) was handed straight to `tool.execute`.
 * Every tool-call choke point must run this before executing a tool.
 */
export type ToolInputValidation =
  | { valid: true }
  | { valid: false; reason: string };

const MAX_STRING_LENGTH = 200_000;
const MAX_ARRAY_LENGTH = 1_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

type PropertySchema = {
  type?: string;
  items?: { type?: string } | unknown;
};

function matchesType(schema: unknown, value: unknown): boolean {
  if (!schema || typeof schema !== "object") return true;
  const expected = (schema as PropertySchema).type;
  if (typeof expected !== "string") return true;
  switch (expected) {
    case "string":
      return typeof value === "string" && value.length <= MAX_STRING_LENGTH;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value) && value.length <= MAX_ARRAY_LENGTH;
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      // Unknown/union schema shapes: leave deeper validation to the tool.
      return true;
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function validateToolInput(
  tool: Pick<ToolDefinition, "name" | "inputSchema">,
  input: unknown,
): ToolInputValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, reason: `${tool.name}: input must be a JSON object` };
  }

  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || key.includes("\0")) {
      return { valid: false, reason: `${tool.name}: unsafe property name "${key}"` };
    }
    if (typeof obj[key] === "string" && (obj[key] as string).length > MAX_STRING_LENGTH) {
      return { valid: false, reason: `${tool.name}: property "${key}" is too large` };
    }
  }

  const schema: JSONSchema = tool.inputSchema ?? { type: "object" };
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = schema.required ?? [];

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      return { valid: false, reason: `${tool.name}: missing required property "${key}"` };
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        return { valid: false, reason: `${tool.name}: unexpected property "${key}"` };
      }
    }
  }

  for (const [key, spec] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    if (!matchesType(spec, value)) {
      const expected = (spec as PropertySchema)?.type ?? "value";
      return {
        valid: false,
        reason: `${tool.name}: property "${key}" must be ${expected}, got ${describe(value)}`,
      };
    }
    if (Array.isArray(value)) {
      const itemSchema = (spec as PropertySchema)?.items as PropertySchema | undefined;
      if (itemSchema && typeof itemSchema.type === "string") {
        for (let i = 0; i < value.length; i++) {
          if (!matchesType(itemSchema, value[i])) {
            return {
              valid: false,
              reason: `${tool.name}: property "${key}[${i}]" must be ${itemSchema.type}`,
            };
          }
        }
      }
    }
  }

  return { valid: true };
}

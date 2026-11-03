import Ajv, { type ValidateFunction } from "ajv";
import type { JSONSchema, ToolDefinition } from "../Tool.js";

/**
 * Runtime validation for tool inputs.
 *
 * `ToolDefinition.inputSchema` is a declaration, not a guarantee: a provider
 * (or a ReAct loop parsing free-form text) can hand us any JSON value. Every
 * tool-call choke point goes through `executeTool()`, which calls this first.
 *
 * Validation is deliberately two-layered:
 *   1. a bounded structural walk (depth / node / size / forbidden-key limits)
 *      that runs before any schema compilation result is applied, so a hostile
 *      payload cannot exhaust memory or pollute prototypes;
 *   2. Ajv, a real recursive JSON-Schema validator, so nested objects,
 *      additionalProperties schemas, enums, unions, patterns and numeric
 *      bounds are all enforced (the old hand-rolled checker only looked at
 *      the top level).
 */
export type ToolInputValidation =
  | { valid: true }
  | { valid: false; reason: string };

const MAX_STRING_LENGTH = 200_000;
const MAX_ARRAY_LENGTH = 1_000;
const MAX_PROPERTIES = 1_000;
const MAX_DEPTH = 24;
const MAX_NODES = 10_000;
const MAX_TOTAL_CHARS = 2_000_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const ajv = new Ajv({
  allErrors: false,
  strict: false,
  allowUnionTypes: true,
  validateFormats: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

/** Compiled validators are cached per schema object (tools are singletons). */
const compiled = new WeakMap<object, ValidateFunction>();

function compile(schema: JSONSchema): ValidateFunction {
  const cached = compiled.get(schema);
  if (cached) return cached;
  // `format` needs ajv-formats; validateFormats:false makes it a no-op, but
  // stripping it keeps compilation portable across Ajv builds.
  const clean = stripFormats(schema) as object;
  const validate = ajv.compile(clean);
  compiled.set(schema, validate);
  return validate;
}

function stripFormats(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFormats);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "format" || k === "$schema" || k === "$id") continue;
    out[k] = stripFormats(v);
  }
  return out;
}

type Budget = { nodes: number; chars: number };

/** Bounded structural pre-check. Returns a rejection reason, or null. */
function precheck(value: unknown, depth: number, budget: Budget): string | null {
  if (++budget.nodes > MAX_NODES) return "input is too complex";
  if (depth > MAX_DEPTH) return "input is nested too deeply";

  if (typeof value === "string") {
    budget.chars += value.length;
    if (value.length > MAX_STRING_LENGTH) return "a string value is too large";
    if (budget.chars > MAX_TOTAL_CHARS) return "input is too large";
    return null;
  }
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) return "an array is too large";
    for (const item of value) {
      const reason = precheck(item, depth + 1, budget);
      if (reason) return reason;
    }
    return null;
  }

  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length > MAX_PROPERTIES) return "an object has too many properties";
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key) || key.includes("\0")) {
      return `unsafe property name "${key}"`;
    }
    budget.chars += key.length;
    if (budget.chars > MAX_TOTAL_CHARS) return "input is too large";
    const reason = precheck((value as Record<string, unknown>)[key], depth + 1, budget);
    if (reason) return reason;
  }
  return null;
}

export function validateToolInput(
  tool: Pick<ToolDefinition, "name" | "inputSchema">,
  input: unknown,
): ToolInputValidation {
  if (!input || typeof input !== "object" || Array.isArray(input) || input instanceof Date) {
    return { valid: false, reason: `${tool.name}: input must be a JSON object` };
  }

  // Reject cycles (JSON.parse cannot produce them, but an in-process caller can).
  const seen = new WeakSet<object>();
  const cycle = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (seen.has(value as object)) return true;
    seen.add(value as object);
    return Object.values(value as Record<string, unknown>).some(cycle);
  };
  if (cycle(input)) {
    return { valid: false, reason: `${tool.name}: input contains a circular reference` };
  }

  const structural = precheck(input, 0, { nodes: 0, chars: 0 });
  if (structural) {
    return { valid: false, reason: `${tool.name}: ${structural}` };
  }

  const schema = tool.inputSchema ?? { type: "object" };
  let validate: ValidateFunction;
  try {
    validate = compile(schema);
  } catch (e) {
    // A schema we cannot compile must never become "validation skipped".
    return {
      valid: false,
      reason: `${tool.name}: inputSchema could not be compiled (${(e as Error).message})`,
    };
  }

  if (!validate(input)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    return { valid: false, reason: `${tool.name}: ${detail || "input does not match inputSchema"}` };
  }
  return { valid: true };
}

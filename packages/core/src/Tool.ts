import type { ResolvedSettings } from "./state/Settings.js";
import { PermissionLevel } from "./permissions/PermissionLevel.js";

/**
 * JSON-Schema-shaped input schema. Kept loose because we hand it directly
 * to provider APIs (Anthropic & OpenAI both accept JSON Schema).
 */
export type JSONSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolResult = {
  content: string;
  isError: boolean;
};

export type ExecutionContext = {
  workingDirectory: string;
  permissionLevel: PermissionLevel;
  /** Hook to ask user for approval; returns true if approved. */
  requestApproval?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
  abortSignal?: AbortSignal;
  /** Phase 5: Pass settings and sessionId into tools */
  settings?: ResolvedSettings;
  sessionId?: string;
  tools?: ToolDefinition[];
};

export type ToolContext = ExecutionContext;

export interface ToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  permissionLevel: PermissionLevel;
  /** If true, requires explicit user approval even when permissionLevel is satisfied. */
  requiresApproval?: boolean;
  execute(input: TInput, ctx: ExecutionContext): Promise<ToolResult>;
}

export function ok(content: string): ToolResult {
  return { content, isError: false };
}

export function err(content: string): ToolResult {
  return { content, isError: true };
}

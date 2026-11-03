/**
 * The single choke point for executing a tool.
 *
 * Previously `queryLoop` and `HermesServer` enforced inputSchema +
 * PermissionGate, while `ReActPlanner`, `StreamingQueryLoop` and `ReActLoop`
 * called `tool.execute()` directly. That meant a malformed or over-privileged
 * tool call could bypass both controls. All callers now go through here;
 * `tool.execute` must not be invoked anywhere else.
 */
import type { ExecutionContext, ToolDefinition, ToolResult } from "../Tool.js";
import { err } from "../Tool.js";
import { PermissionGate } from "../permissions/PermissionGate.js";
import { validateToolInput } from "./validateToolInput.js";

export type ToolExecutionEvent =
  | { type: "invalid_input"; tool: string; reason: string }
  | { type: "permission_denied"; tool: string; reason: string }
  | { type: "permission_request"; tool: string; input: Record<string, unknown> };

export type ToolExecutionStage =
  | "invalid_input"
  | "permission_denied"
  | "approval_denied"
  | "executed"
  | "error";

export interface ToolExecutionHooks {
  /** Called synchronously-in-order as each decision is made. */
  onEvent?: (event: ToolExecutionEvent) => void | Promise<void>;
  /** Overrides `ctx.requestApproval`; absent approvers fail closed. */
  approve?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
  onPreTool?: (toolName: string, input: Record<string, unknown>) => void | Promise<void>;
  onPostTool?: (
    toolName: string,
    input: Record<string, unknown>,
    result: ToolResult,
  ) => void | Promise<void>;
  /** Applied to tool output before it is returned (e.g. context compression). */
  transformResult?: (content: string) => string;
}

export interface ToolExecutionOutcome {
  stage: ToolExecutionStage;
  result: ToolResult;
  input: Record<string, unknown>;
  events: ToolExecutionEvent[];
  reason?: string;
}

export async function executeTool(
  tool: ToolDefinition,
  rawInput: unknown,
  ctx: ExecutionContext,
  hooks: ToolExecutionHooks = {},
): Promise<ToolExecutionOutcome> {
  const events: ToolExecutionEvent[] = [];
  const emit = async (event: ToolExecutionEvent): Promise<void> => {
    events.push(event);
    if (hooks.onEvent) await hooks.onEvent(event);
  };

  // 1. Schema validation, before any permission decision or tool code runs.
  const validation = validateToolInput(tool, rawInput);
  if (!validation.valid) {
    const reason = `Invalid tool input: ${validation.reason}`;
    await emit({ type: "invalid_input", tool: tool.name, reason });
    return {
      stage: "invalid_input",
      reason,
      result: err(reason),
      input: {},
      events,
    };
  }
  const input = rawInput as Record<string, unknown>;

  // 2. Permission gate (fails closed on invalid levels).
  const check = PermissionGate.check(tool, ctx);
  if (check.allowed === false) {
    await emit({ type: "permission_denied", tool: tool.name, reason: check.reason });
    return {
      stage: "permission_denied",
      reason: check.reason,
      result: err(check.reason),
      input,
      events,
    };
  }

  // 3. Explicit approval. No approver configured => deny (never auto-approve).
  if (check.allowed === "needs_approval") {
    await emit({ type: "permission_request", tool: tool.name, input });
    const approve = hooks.approve ?? ctx.requestApproval;
    const approved = approve ? await approve(tool.name, input) : false;
    if (!approved) {
      const reason = "User denied approval";
      await emit({ type: "permission_denied", tool: tool.name, reason });
      return {
        stage: "approval_denied",
        reason,
        result: err("User denied permission"),
        input,
        events,
      };
    }
  }

  // 4. Execute, with exceptions converted into tool errors.
  if (hooks.onPreTool) await hooks.onPreTool(tool.name, input);
  let result: ToolResult;
  let stage: ToolExecutionStage = "executed";
  try {
    result = await tool.execute(input, ctx);
  } catch (e) {
    stage = "error";
    result = err(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (hooks.onPostTool) await hooks.onPostTool(tool.name, input, result);
  if (hooks.transformResult) {
    result = { ...result, content: hooks.transformResult(result.content) };
  }

  return { stage, result, input, events };
}

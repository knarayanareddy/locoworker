import type { ToolDefinition } from "@cowork/core";
import { PermissionLevel } from "@cowork/core";
import { OrchestratorEngine } from "./OrchestratorEngine";

export const Orchestrate: ToolDefinition = {
  name: "Orchestrate",
  description: "Decompose a complex goal into multiple tasks and execute them using specialized agents.",
  inputSchema: {
    type: "object",
    properties: { goal: { type: "string" } },
    required: ["goal"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(input: { goal: string }, ctx) {
    const engine = new OrchestratorEngine({
      projectRoot: ctx.workingDirectory,
      // @ts-ignore
      provider: ctx.provider?.name ?? "anthropic",
      // @ts-ignore
      model: ctx.provider?.model ?? "claude-3-5-sonnet-20240620",
      tools: [], // recursively empty for now to avoid loops
    });
    const result = await engine.run(input.goal);
    return { content: result, isError: false };
  },
};

export const ORCHESTRATOR_TOOLS = [Orchestrate];

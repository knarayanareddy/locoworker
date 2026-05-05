import { PermissionLevel, type ToolDefinition, type ToolContext } from "@cowork/core";
import { OrchestratorEngine } from "./OrchestratorEngine";
import type { AgentSpec } from "./types";

export const Orchestrate: ToolDefinition = {
  name: "Orchestrate",
  description:
    "Decompose a complex goal into subtasks and run them in parallel across specialized agents " +
    "(planner, executor, reviewer, synthesizer). Returns a synthesized final answer.",
  inputSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "The high-level goal to accomplish",
      },
      agents: {
        type: "array",
        description:
          "Agent specs. Omit to use defaults (planner + executor + synthesizer).",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            role: {
              type: "string",
              enum: ["planner", "executor", "reviewer", "synthesizer", "critic"],
            },
            model: { type: "string" },
            tools: { type: "array", items: { type: "string" } },
            maxTurns: { type: "number" },
          },
          required: ["id", "role"],
        },
      },
    },
    required: ["goal"],
  },
  permissionLevel: PermissionLevel.ELEVATED,
  async execute(
    input: { goal: string; agents?: AgentSpec[] },
    ctx: ToolContext
  ) {
    const agents: AgentSpec[] = input.agents ?? [
      { id: "planner-1", role: "planner" },
      { id: "executor-1", role: "executor" },
      { id: "synthesizer-1", role: "synthesizer" },
    ];

    const engine = new OrchestratorEngine({
      projectRoot: ctx.workingDirectory,
      settings: ctx.settings!,
      tools: ctx.tools ?? [],
    });

    try {
      const result = await engine.run(input.goal, agents);
      return {
        content: [
          `## Orchestration Result`,
          `**Goal:** ${result.goal}`,
          `**Tasks:** ${result.plan.tasks.length} | **Turns:** ${result.totalTurns} | **Completed:** ${result.completedAt}`,
          "",
          "### Synthesis",
          result.synthesis,
        ].join("\n"),
        isError: false,
      };
    } catch (err) {
      return {
        content: `Orchestration failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const ORCHESTRATOR_TOOLS: ToolDefinition[] = [Orchestrate];

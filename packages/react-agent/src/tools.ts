import type { ToolDefinition, ToolContext } from "@cowork/core";
import { ReActLoop } from "./ReActLoop";

export const ReActRun: ToolDefinition = {
  name: "ReActRun",
  description:
    "Run a task using the ReAct (Reasoning + Acting) agent pattern. " +
    "Unlike standard tool calling, ReAct uses explicit Thought→Action→Observation " +
    "text-based reasoning — compatible with any model including ones that don't support native tool calls.",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "string", description: "The task to complete" },
      maxSteps: {
        type: "number",
        description: "Max reasoning steps (default 10, max 20)",
      },
    },
    required: ["task"],
  },
  permissionLevel: "STANDARD",
  async execute(input: { task: string; maxSteps?: number }, ctx: ToolContext) {
    const loop = new ReActLoop({
      settings: ctx.settings!,
      tools: ctx.tools ?? [],
      maxSteps: Math.min(input.maxSteps ?? 10, 20),
      projectRoot: ctx.workingDirectory,
    });

    try {
      const result = await loop.run(input.task);
      const stepSummary = result.steps
        .map((s) => `Step ${s.stepNum}: ${s.thought.slice(0, 80)}${s.action ? ` → ${s.action}` : ""}${s.isFinal ? " [FINAL]" : ""}`)
        .join("\n");

      return {
        content: [
          `## ReAct Result (${result.totalSteps} steps, ${result.success ? "success" : "incomplete"})`,
          "",
          `### Answer`,
          result.finalAnswer,
          "",
          `### Reasoning Trace`,
          stepSummary,
        ].join("\n"),
        isError: !result.success,
      };
    } catch (err) {
      return {
        content: `ReAct failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const REACT_TOOLS: ToolDefinition[] = [ReActRun];

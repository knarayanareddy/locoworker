import type { ToolDefinition } from "@cowork/core";
import { PermissionLevel } from "@cowork/core";
import { AutoResearch } from "./AutoResearch";

export const ResearchEnqueue: ToolDefinition = {
  name: "ResearchEnqueue",
  description: "Queue a background research task. Results will be saved to memory and wiki.",
  inputSchema: {
    type: "object",
    properties: { question: { type: "string" } },
    required: ["question"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { question: string }, ctx) {
    const research = new AutoResearch({
      projectRoot: ctx.workingDirectory,
      provider: (ctx as any).provider?.name ?? "anthropic", // bit of a hack, might need better config flow
      model: (ctx as any).provider?.model ?? "claude-3-5-sonnet-20240620",
    });
    const id = await research.enqueue(input.question);
    return {
      content: `Research task queued: ${id}\nKAIROS will process this in the background.`,
      isError: false,
    };
  },
};

export const ResearchNow: ToolDefinition = {
  name: "ResearchNow",
  description: "Perform research immediately (blocking).",
  inputSchema: {
    type: "object",
    properties: { question: { type: "string" } },
    required: ["question"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(input: { question: string }, ctx) {
    const research = new AutoResearch({
      projectRoot: ctx.workingDirectory,
      // @ts-ignore - reaching into context to get provider/model
      provider: ctx.provider?.name ?? "anthropic",
      // @ts-ignore
      model: ctx.provider?.model ?? "claude-3-5-sonnet-20240620",
    });
    const id = `now-${Date.now()}`;
    const job = await research.runJob(id, input.question);
    if (job.status === "failed") return { content: `Research failed: ${job.error}`, isError: true };
    return {
      content: `## Research Result\n\n${job.answer}`,
      isError: false,
    };
  },
};

export const RESEARCH_TOOLS = [ResearchEnqueue, ResearchNow];

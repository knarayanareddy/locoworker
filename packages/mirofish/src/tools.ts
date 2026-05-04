import type { ToolDefinition, ToolContext } from "@cowork/core";
import { MiroFishStudio } from "./MiroFishStudio";
import type { PlatformType } from "./types";

export const SimulationRun: ToolDefinition = {
  name: "SimulationRun",
  description: [
    "Run a MiroFish swarm intelligence simulation to predict social/market reactions.",
    "Spawns diverse AI agents with distinct personalities, lets them interact across rounds,",
    "and produces a report with sentiment distribution and predicted outcomes.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      scenario: {
        type: "string",
        description: "The scenario or event to simulate reaction to",
      },
      question: {
        type: "string",
        description: "What specific outcome are we trying to predict?",
      },
      platform: {
        type: "string",
        enum: ["twitter", "reddit", "slack", "neutral"],
        default: "neutral",
      },
      agentCount: { type: "number", description: "Number of agents (default 15, max 100)" },
      rounds: { type: "number", description: "Simulation rounds (default 6, max 40)" },
    },
    required: ["scenario", "question"],
  },
  permissionLevel: "STANDARD",
  async execute(
    input: {
      scenario: string;
      question: string;
      platform?: PlatformType;
      agentCount?: number;
      rounds?: number;
    },
    ctx: ToolContext
  ) {
    const studio = new MiroFishStudio({ projectRoot: ctx.workingDirectory });
    try {
      const report = await studio.run({
        seedDocument: input.scenario,
        scenarioPrompt: input.question,
        platform: input.platform ?? "neutral",
        agentCount: input.agentCount ?? 15,
        rounds: input.rounds ?? 6,
        modelProvider: ctx.settings!.provider,
        model: ctx.settings!.model,
        concurrency: 3,
      });

      return {
        content: report.rawMarkdown,
        isError: false,
      };
    } catch (err) {
      return {
        content: `Simulation failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const MIROFISH_TOOLS: ToolDefinition[] = [SimulationRun];

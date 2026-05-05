import { PermissionLevel, type ToolDefinition, type ToolContext } from "@cowork/core";
import { MiroFishStudio } from "./MiroFishStudio.js";

export const SimulationRun: ToolDefinition = {
  name: "SimulationRun",
  description: [
    "Run a MiroFish multi-agent swarm simulation. Provide a seed document (news, report, announcement)",
    "and a scenario question (what reaction to predict). The simulation spawns AI agents with unique",
    "personalities, runs them through interaction rounds, and generates a prediction report.",
    "Returns the prediction summary. Full report saved to mirofish-out/ and wiki.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      seedDocument: {
        type: "string",
        description: "The event/scenario seed (news article, product announcement, etc.)",
      },
      scenarioPrompt: {
        type: "string",
        description: "What to predict (e.g. 'How will users react to this price increase?')",
      },
      platform: {
        type: "string",
        enum: ["twitter", "reddit", "slack", "neutral"],
        description: "Simulated platform (default: neutral)",
      },
      agentCount: {
        type: "number",
        description: "Number of agents (5–100, default 20)",
      },
      rounds: {
        type: "number",
        description: "Simulation rounds (1–40, default 10)",
      },
    },
    required: ["seedDocument", "scenarioPrompt"],
  },
  permissionLevel: PermissionLevel.ELEVATED,
  async execute(
    input: {
      seedDocument: string;
      scenarioPrompt: string;
      platform?: string;
      agentCount?: number;
      rounds?: number;
    },
    ctx: ToolContext
  ) {
    const studio = new MiroFishStudio({ projectRoot: ctx.workingDirectory });
    const progressLines: string[] = [];

    try {
      const report = await studio.run(
        {
          seedDocument: input.seedDocument,
          scenarioPrompt: input.scenarioPrompt,
          platform: (input.platform ?? "neutral") as any,
          agentCount: Math.min(input.agentCount ?? 20, 100),
          rounds: Math.min(input.rounds ?? 10, 40),
          modelProvider: ctx.settings?.provider ?? "ollama",
          model: ctx.settings?.model ?? "qwen2.5-coder:7b",
          concurrency: 4,
        },
        (round, count) => {
          progressLines.push(`Round ${round}: ${count} actions`);
        }
      );

      return {
        content: [
          `## MiroFish Simulation Complete`,
          `**Agents:** ${report.agentCount} | **Rounds:** ${report.rounds} | **Actions:** ${report.totalActions}`,
          "",
          `### Prediction`,
          report.prediction,
          "",
          `### Dominant Narrative`,
          report.dominantNarrative,
          "",
          `### Belief Distribution`,
          `For: ${report.finalBeliefDistribution.stronglyFor + report.finalBeliefDistribution.mildlyFor} agents`,
          `Against: ${report.finalBeliefDistribution.mildlyAgainst + report.finalBeliefDistribution.stronglyAgainst} agents`,
          `Neutral: ${report.finalBeliefDistribution.neutral} agents`,
          "",
          `Full report: mirofish-out/${report.id}-report.md`,
        ].join("\n"),
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

export function makeSimulationTools(..._args: any[]): ToolDefinition[] {
  return MIROFISH_TOOLS;
}

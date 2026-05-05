import { PermissionLevel } from "../permissions/PermissionLevel.js";
import type { ToolDefinition, ExecutionContext as ToolContext } from "../Tool.js";
import { CouncilDebate, type CouncilAgent } from "./CouncilDebate.js";

export const CouncilRun: ToolDefinition = {
  name: "CouncilRun",
  description: [
    "Run a structured multi-agent council debate on a question.",
    "Multiple AI agents with different stances (for/against/neutral/devil/expert/pragmatist) argue",
    "in structured rounds, then a moderator delivers a verdict with confidence level.",
    "Best for: architecture decisions, risk assessment, design tradeoffs.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question or proposition for the council to debate",
      },
      context: {
        type: "string",
        description: "Optional background context for the debate",
      },
      stances: {
        type: "array",
        description: "Agent stances (default: for, against, devil, expert, pragmatist)",
        items: {
          type: "string",
          enum: ["for", "against", "neutral", "devil", "expert", "pragmatist"],
        },
      },
      rounds: {
        type: "number",
        description: "Debate rounds per agent (default 2)",
      },
    },
    required: ["question"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(
    input: {
      question: string;
      context?: string;
      stances?: string[];
      rounds?: number;
    },
    ctx: ToolContext
  ) {
    const stances = (input.stances ?? ["for", "against", "devil", "expert", "pragmatist"]) as any[];
    const agents: CouncilAgent[] = stances.map((stance, i) => ({
      id: `agent-${i}`,
      name: `Councilor ${String.fromCharCode(65 + i)}`,
      stance,
    }));

    const debate = new CouncilDebate({
      question: input.question,
      context: input.context,
      agents,
      debateRounds: Math.min(input.rounds ?? 2, 4),
      settings: ctx.settings!,
    });

    try {
      const result = await debate.run();
      const lines = [
        `## Council Verdict`,
        `**Question:** ${result.question}`,
        `**Confidence:** ${result.confidence} | **Turns:** ${result.totalTurns}`,
        "",
        `### Verdict`,
        result.verdict,
        result.dissent ? `\n**Strongest dissent:** ${result.dissent}` : "",
        "",
        `### Debate Transcript`,
        ...result.rounds.map((r) => {
          const agent = agents.find((a) => a.id === r.agentId)!;
          return `**[R${r.round}] ${agent.name} (${r.stance}):** ${r.argument}`;
        }),
      ].filter((l) => l !== undefined);

      return { content: lines.join("\n"), isError: false };
    } catch (err) {
      return {
        content: `Council failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};

export const COUNCIL_TOOLS: ToolDefinition[] = [CouncilRun];

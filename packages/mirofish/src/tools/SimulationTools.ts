import { PermissionLevel, type ToolDefinition } from "@cowork/core";
import type { SimulationRunner } from "../simulation/SimulationRunner.js";

export function makeSimulationTools(runner: SimulationRunner): ToolDefinition[] {
  return [
    {
      name: "simulate",
      description:
        "Run a MiroFish multi-agent simulation. Define a scenario and agents, " +
        "then watch them interact across multiple rounds.",
      permissionLevel: PermissionLevel.STANDARD,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Simulation name." },
          scenario: { type: "string", description: "The scenario/situation to simulate." },
          agents: {
            type: "array",
            description: "List of agents participating in the simulation.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                system_prompt: { type: "string" },
              },
              required: ["name", "role", "system_prompt"],
            },
          },
          rounds: { type: "number", description: "Number of simulation rounds (default: 3, max: 10)." },
          save_to_wiki: { type: "boolean", description: "Save simulation summary to wiki." },
        },
        required: ["name", "scenario", "agents"],
      },
      async execute(input: {
        name: string;
        scenario: string;
        agents: Array<{ name: string; role: string; system_prompt: string }>;
        rounds?: number;
        save_to_wiki?: boolean;
      }) {
        const rounds = Math.min(input.rounds ?? 3, 10);

        process.stderr.write(
          `[mirofish] Starting simulation "${input.name}" (${input.agents.length} agents, ${rounds} rounds)\n`
        );

        try {
          const result = await runner.run(
            {
              name: input.name,
              scenario: input.scenario,
              agents: input.agents.map((a) => ({
                name: a.name,
                role: a.role,
                systemPrompt: a.system_prompt,
              })),
              rounds,
              saveToWiki: input.save_to_wiki ?? false,
            },
            (round) => {
              process.stderr.write(
                `[mirofish] Round ${round.round}/${rounds} complete (${round.messages.length} messages)\n`
              );
            }
          );

          const lines = [
            `## Simulation: "${result.config.name}" — Complete`,
            `Rounds: ${result.rounds.length}  Agents: ${result.config.agents.length}`,
            `Total tokens: ${result.totalInputTokens + result.totalOutputTokens}`,
            `Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
            ``,
            `## Summary`,
            result.summary ?? "No summary generated.",
          ];

          return { content: lines.join("\n"), isError: false };
        } catch (err) {
          return {
            content: `Simulation failed: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },
  ];
}

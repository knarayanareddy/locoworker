import type { SlashCommand } from "./SlashCommand.js";

export const simulateCommand: SlashCommand = {
  name: "simulate",
  description: "Run a MiroFish multi-agent simulation.",
  async execute(args, ctx) {
    if (!args || args.length === 0) {
      ctx.print("Usage: /simulate <scenario description>");
      ctx.print("");
      ctx.print("Runs a simulation with default agents.");
      ctx.print("For custom agents, use the simulate tool directly.");
      return;
    }

    if (!ctx.runTurn) {
      ctx.print("runTurn not available.");
      return;
    }

    const scenario = args.join(" ");
    await ctx.runTurn(`Use the simulate tool to run a simulation of this scenario: ${scenario}. Use 3 agents with complementary perspectives and 3 rounds.`);
  },
};

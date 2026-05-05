import type { SlashCommand } from "./SlashCommand.js";

export const researchCommand: SlashCommand = {
  name: "research",
  description: "Run an AutoResearch loop on a question.",
  async execute(args, ctx) {
    if (!args || args.length === 0) {
      ctx.print("Usage: /research <question>");
      ctx.print("");
      ctx.print("Runs a full Plan → Execute → Report research loop.");
      ctx.print("The report is saved to the project wiki automatically.");
      return;
    }

    if (!ctx.runTurn) {
      ctx.print("runTurn not available in this context.");
      return;
    }

    const question = args.join(" ");
    await ctx.runTurn(`Use the research tool to thoroughly investigate this question: ${question}`);
  },
};

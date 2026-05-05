import type { SlashCommand } from "./SlashCommand.js";

export const councilCommand: SlashCommand = {
  name: "council",
  description: "Run a council debate on a question.",
  async execute(args, ctx) {
    if (!args || args.length === 0) {
      ctx.print("Usage: /council <question>");
      ctx.print("");
      ctx.print("Runs a multi-agent council debate (Architect, Pragmatist, Skeptic).");
      ctx.print("Produces a consensus verdict with key caveats.");
      return;
    }

    if (!ctx.runTurn) {
      ctx.print("runTurn not available.");
      return;
    }

    const question = args.join(" ");
    await ctx.runTurn(`Use the council_debate tool to get a multi-perspective verdict on: ${question}`);
  },
};

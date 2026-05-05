import type { SlashCommand } from "./SlashCommand.js";

export const ultraplanCommand: SlashCommand = {
  name: "ultraplan",
  description: "Decompose a complex goal into a parallel task graph using the Orchestrator.",
  usage: "/ultraplan <goal>",
  async execute(args, ctx) {
    if (!args || args.length === 0) {
      ctx.print("Usage: /ultraplan <goal>");
      ctx.print("");
      ctx.print("Delegates a complex task to the multi-agent coordinator.");
      ctx.print("The coordinator decomposes it into subtasks, runs worker agents in parallel, and synthesizes the results.");
      return;
    }

    if (!ctx.runTurn) {
      ctx.print("runTurn not available.");
      return;
    }

    const goal = args.join(" ");
    ctx.print(`\nInitializing UltraPlan for: "${goal}"`);
    ctx.print("Decomposing goal into parallel task graph...");
    
    // We prompt the engine to use the orchestrate tool, which is injected in session.ts
    await ctx.runTurn(`Use the orchestrate tool to accomplish the following goal: ${goal}`);
  },
};

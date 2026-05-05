import type { SlashCommand } from "./SlashCommand.js";

export const forecastCommand: SlashCommand = {
  name: "forecast",
  description: "Run a MiroFish simulation to forecast the impact of a proposed change.",
  usage: "/forecast <proposal>",
  async execute(args, ctx) {
    if (!args || args.length === 0) {
      ctx.print("Usage: /forecast <proposal>");
      ctx.print("");
      ctx.print("Example: /forecast refactor telemetry to use Redis");
      ctx.print("Runs a swarm of agents to simulate the impact and report on potential dependency breaks.");
      return;
    }

    if (!ctx.runTurn) {
      ctx.print("runTurn not available.");
      return;
    }

    const proposal = args.join(" ");
    ctx.print(`\nInitializing MiroFish Forecast for: "${proposal}"`);
    ctx.print("Spawning simulation swarm to predict impacts and dependency breaks...");
    
    // We prompt the engine to use the SimulationRun tool.
    await ctx.runTurn(
      `Use the SimulationRun tool to forecast the impact of this codebase proposal: "${proposal}". ` +
      `For the seedDocument, provide a detailed description of the proposed codebase change based on the prompt. ` +
      `For the scenarioPrompt, specifically ask: "What dependency breaks, architectural regressions, or side-effects will occur?" ` +
      `Set agentCount to 20 and rounds to 5.`
    );
  },
};

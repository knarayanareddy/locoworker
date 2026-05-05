import type { SlashCommand } from "./SlashCommand.js";

export const telemetryCommand: SlashCommand = {
  name: "telemetry",
  description: "Show cost and usage summary for recent sessions.",
  usage: "/telemetry [days]",
  async execute(args, ctx) {
    const days = parseInt(args[0] || "30", 10) || 30;
    const moduleName = "@cowork/telemetry/cost";
    const { CostTracker } = await import(moduleName);
    const tracker = new CostTracker();
    await tracker.init();
    const summary = await tracker.summarize(days) as any;

    const lines = [
      `Cost & Usage (last ${days} days):`,
      `  Sessions:      ${summary.totalSessions}`,
      `  Input tokens:  ${summary.totalInputTokens.toLocaleString()}`,
      `  Output tokens: ${summary.totalOutputTokens.toLocaleString()}`,
      `  Total cost:    ${summary.formattedCost}`,
      ``,
      `By model:`,
      ...Object.entries(summary.byModel).map(
        ([m, s]: [string, any]) =>
          `  ${m.padEnd(28)} ${s.sessions} sessions  $${s.costUsd.toFixed(4)}`
      ),
    ];

    ctx.print(lines.join("\n"));
  },
};

import type { SlashCommand } from "./SlashCommand.js";

export const analyticsCommand: SlashCommand = {
  name: "analytics",
  description: "Show aggregate analytics report for recent sessions.",
  usage: "/analytics [days]",
  async execute(args, ctx) {
    const days = parseInt(args[0] || "30", 10) || 30;
    const moduleName = "@cowork/analytics";
    const { AggregateReporter } = await import(moduleName);
    const reporter = new AggregateReporter();
    const report = await reporter.formatReport(days);
    ctx.print(report);
  },
};

import { CostTracker } from "./CostTracker";
export const UsageReport = {
    name: "UsageReport",
    description: "Show token usage and estimated cost. " +
        "date: specific YYYY-MM-DD, month: YYYY-MM, or omit for today's summary.",
    inputSchema: {
        type: "object",
        properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            month: { type: "string", description: "YYYY-MM" },
        },
        required: [],
    },
    permissionLevel: "READ_ONLY",
    async execute(input, ctx) {
        const tracker = new CostTracker(ctx.workingDirectory, "report");
        if (input.month) {
            const summary = await tracker.monthlySummary(input.month);
            const lines = [
                `## Monthly Usage: ${summary.month}`,
                `Total cost: $${summary.totalCostUsd.toFixed(4)}`,
                `Total tokens: ${summary.totalTokens.toLocaleString()}`,
                "",
                "### Daily breakdown:",
                ...summary.dailyBreakdown.map((d) => `  ${d.date}: $${d.totalCostUsd.toFixed(4)} | ${(d.totalInputTokens + d.totalOutputTokens).toLocaleString()} tokens | ${d.sessionCount} session(s)`),
            ];
            return { content: lines.join("\n"), isError: false };
        }
        const summary = await tracker.dailySummary(input.date);
        if (!summary) {
            return { content: `No usage data for ${input.date ?? "today"}`, isError: false };
        }
        const modelLines = Object.entries(summary.byModel).map(([model, data]) => `  ${model}: $${data.costUsd.toFixed(4)} | in: ${data.inputTokens.toLocaleString()} | out: ${data.outputTokens.toLocaleString()}`);
        const lines = [
            `## Usage: ${summary.date}`,
            `Total cost: $${summary.totalCostUsd.toFixed(4)}`,
            `Input tokens: ${summary.totalInputTokens.toLocaleString()}`,
            `Output tokens: ${summary.totalOutputTokens.toLocaleString()}`,
            `Sessions: ${summary.sessionCount}`,
            "",
            "### By model:",
            ...modelLines,
        ];
        return { content: lines.join("\n"), isError: false };
    },
};
export const ANALYTICS_TOOLS = [UsageReport];
//# sourceMappingURL=tools.js.map
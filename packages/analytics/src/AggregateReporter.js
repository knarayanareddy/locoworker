import { join } from "node:path";
import { homedir } from "node:os";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
export class AggregateReporter {
    analyticsDir;
    constructor() {
        this.analyticsDir = join(homedir(), ".cowork", "analytics");
    }
    async report(days = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const sessions = await this.loadSessions(cutoff);
        const report = {
            generatedAt: new Date().toISOString(),
            periodDays: days,
            totalSessions: sessions.length,
            totalTurns: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalToolCalls: 0,
            totalCostUsd: 0,
            topTools: [],
            sessionsByDay: {},
            avgTurnsPerSession: 0,
            avgCostPerSession: 0,
        };
        const toolMap = new Map();
        for (const s of sessions) {
            report.totalTurns += s.totalTurns;
            report.totalInputTokens += s.totalInputTokens;
            report.totalOutputTokens += s.totalOutputTokens;
            report.totalToolCalls += s.totalToolCalls;
            report.totalCostUsd += s.costUsd;
            // Group by day
            const day = s.startedAt.slice(0, 10);
            report.sessionsByDay[day] = (report.sessionsByDay[day] ?? 0) + 1;
            // Aggregate tool usage
            for (const t of s.toolUsage) {
                const agg = toolMap.get(t.toolName) ?? {
                    toolName: t.toolName,
                    callCount: 0,
                    errorCount: 0,
                    avgDurationMs: 0,
                    totalDurationMs: 0,
                };
                agg.callCount += t.callCount;
                agg.errorCount += t.errorCount;
                agg.totalDurationMs += t.totalDurationMs;
                agg.avgDurationMs = agg.totalDurationMs / agg.callCount;
                toolMap.set(t.toolName, agg);
            }
        }
        report.topTools = [...toolMap.values()]
            .sort((a, b) => b.callCount - a.callCount)
            .slice(0, 10);
        if (sessions.length > 0) {
            report.avgTurnsPerSession = report.totalTurns / sessions.length;
            report.avgCostPerSession = report.totalCostUsd / sessions.length;
        }
        return report;
    }
    async formatReport(days = 30) {
        const r = await this.report(days);
        const lines = [
            `═══ Locoworker Analytics Report (last ${days} days) ═══`,
            `Generated: ${r.generatedAt}`,
            ``,
            `Sessions:    ${r.totalSessions}`,
            `Turns:       ${r.totalTurns} (avg ${r.avgTurnsPerSession.toFixed(1)}/session)`,
            `Input tok:   ${r.totalInputTokens.toLocaleString()}`,
            `Output tok:  ${r.totalOutputTokens.toLocaleString()}`,
            `Tool calls:  ${r.totalToolCalls}`,
            `Total cost:  $${r.totalCostUsd.toFixed(4)} (avg $${r.avgCostPerSession.toFixed(4)}/session)`,
            ``,
            `Top Tools:`,
            ...r.topTools.map((t) => `  ${t.toolName.padEnd(20)} ${t.callCount} calls  ${t.errorCount} errors  ${t.avgDurationMs.toFixed(0)}ms avg`),
            ``,
            `Sessions by day:`,
            ...Object.entries(r.sessionsByDay)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, count]) => `  ${day}: ${count}`),
        ];
        return lines.join("\n");
    }
    async loadSessions(cutoff) {
        if (!existsSync(this.analyticsDir))
            return [];
        try {
            const files = await readdir(this.analyticsDir);
            const jsons = files.filter((f) => f.endsWith(".json"));
            const sessions = await Promise.all(jsons.map(async (f) => {
                try {
                    const raw = await readFile(join(this.analyticsDir, f), "utf-8");
                    return JSON.parse(raw);
                }
                catch {
                    return null;
                }
            }));
            return sessions
                .filter((s) => s !== null)
                .filter((s) => new Date(s.startedAt) >= cutoff);
        }
        catch {
            return [];
        }
    }
}
//# sourceMappingURL=AggregateReporter.js.map
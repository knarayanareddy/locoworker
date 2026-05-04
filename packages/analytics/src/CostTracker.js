import { estimateCost } from "./pricing";
import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";
export class CostTracker {
    projectRoot;
    sessionId;
    records = [];
    constructor(projectRoot, sessionId) {
        this.projectRoot = projectRoot;
        this.sessionId = sessionId;
    }
    track(opts) {
        const record = {
            ts: new Date().toISOString(),
            sessionId: this.sessionId,
            provider: opts.provider,
            model: opts.model,
            inputTokens: opts.inputTokens,
            outputTokens: opts.outputTokens,
            estimatedCostUsd: estimateCost(opts.model, opts.inputTokens, opts.outputTokens),
            tool: opts.tool,
        };
        this.records.push(record);
        void this.append(record);
        return record;
    }
    sessionSummary() {
        return {
            totalInputTokens: this.records.reduce((s, r) => s + r.inputTokens, 0),
            totalOutputTokens: this.records.reduce((s, r) => s + r.outputTokens, 0),
            estimatedCostUsd: this.records.reduce((s, r) => s + r.estimatedCostUsd, 0),
            turnsTracked: this.records.length,
        };
    }
    async dailySummary(date) {
        const d = date ?? new Date().toISOString().slice(0, 10);
        const file = this.usageFile(d);
        let lines;
        try {
            const raw = await Bun.file(file).text();
            lines = raw.split("\n").filter(Boolean);
        }
        catch {
            return null;
        }
        const records = lines.map((l) => JSON.parse(l));
        const byModel = {};
        const sessions = new Set();
        for (const r of records) {
            sessions.add(r.sessionId);
            const m = (byModel[r.model] ??= { inputTokens: 0, outputTokens: 0, costUsd: 0 });
            m.inputTokens += r.inputTokens;
            m.outputTokens += r.outputTokens;
            m.costUsd += r.estimatedCostUsd;
        }
        return {
            date: d,
            totalInputTokens: records.reduce((s, r) => s + r.inputTokens, 0),
            totalOutputTokens: records.reduce((s, r) => s + r.outputTokens, 0),
            totalCostUsd: records.reduce((s, r) => s + r.estimatedCostUsd, 0),
            byModel,
            sessionCount: sessions.size,
        };
    }
    async monthlySummary(yearMonth) {
        const ym = yearMonth ?? new Date().toISOString().slice(0, 7);
        const dir = this.usageDir();
        const glob = new (await import("bun")).Glob(`${ym}-*.jsonl`);
        const summaries = [];
        try {
            for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) {
                const d = file.replace(".jsonl", "");
                const s = await this.dailySummary(d);
                if (s)
                    summaries.push(s);
            }
        }
        catch { /* no data */ }
        return {
            month: ym,
            totalCostUsd: summaries.reduce((s, d) => s + d.totalCostUsd, 0),
            totalTokens: summaries.reduce((s, d) => s + d.totalInputTokens + d.totalOutputTokens, 0),
            dailyBreakdown: summaries.sort((a, b) => a.date.localeCompare(b.date)),
        };
    }
    async append(record) {
        const dir = this.usageDir();
        await mkdir(dir, { recursive: true });
        const file = this.usageFile(record.ts.slice(0, 10));
        const existing = await Bun.file(file).text().catch(() => "");
        await Bun.write(file, existing + JSON.stringify(record) + "\n");
    }
    usageDir() {
        return path.join(MemorySystem.rootFor(this.projectRoot), "analytics");
    }
    usageFile(date) {
        return path.join(this.usageDir(), `${date}.jsonl`);
    }
}
//# sourceMappingURL=CostTracker.js.map
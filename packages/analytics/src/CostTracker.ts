import { estimateCost } from "./pricing";
import { MemorySystem } from "@cowork/core";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export interface UsageRecord {
  ts: string;
  sessionId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  tool?: string;
}

export interface DailySummary {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  sessionCount: number;
}

export class CostTracker {
  private projectRoot: string;
  private sessionId: string;
  private records: UsageRecord[] = [];

  constructor(projectRoot: string, sessionId: string) {
    this.projectRoot = projectRoot;
    this.sessionId = sessionId;
  }

  track(opts: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    tool?: string;
  }): UsageRecord {
    const record: UsageRecord = {
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

  sessionSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUsd: number;
    turnsTracked: number;
  } {
    return {
      totalInputTokens: this.records.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: this.records.reduce((s, r) => s + r.outputTokens, 0),
      estimatedCostUsd: this.records.reduce((s, r) => s + r.estimatedCostUsd, 0),
      turnsTracked: this.records.length,
    };
  }

  async dailySummary(date?: string): Promise<DailySummary | null> {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const file = this.usageFile(d);
    let lines: string[];
    try {
      const raw = await Bun.file(file).text();
      lines = raw.split("\n").filter(Boolean);
    } catch {
      return null;
    }

    const records: UsageRecord[] = lines.map((l) => JSON.parse(l));
    const byModel: DailySummary["byModel"] = {};
    const sessions = new Set<string>();

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

  private async append(record: UsageRecord): Promise<void> {
    const date = record.ts.slice(0, 10);
    const file = this.usageFile(date);
    await mkdir(path.dirname(file), { recursive: true });

    const line = JSON.stringify(record) + "\n";
    const existing = await Bun.file(file).text().catch(() => "");
    await Bun.write(file, existing + line);
  }

  private usageFile(date: string): string {
    return path.join(
      MemorySystem.rootFor(this.projectRoot),
      "analytics",
      `usage-${date}.jsonl`
    );
  }
}

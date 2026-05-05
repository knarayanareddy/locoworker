import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { calculateCost, formatCost } from "./pricing.js";

export interface CostRecord {
  sessionId: string;
  model: string;
  provider: string;
  projectRoot: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: string;
}

export interface CostSummary {
  totalSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  formattedCost: string;
  byModel: Record<string, { sessions: number; inputTokens: number; outputTokens: number; costUsd: number }>;
  byProvider: Record<string, { sessions: number; costUsd: number }>;
}

export class CostTracker {
  private ledgerPath: string;

  constructor() {
    this.ledgerPath = join(homedir(), ".cowork", "cost-ledger.ndjson");
  }

  async init(): Promise<void> {
    await mkdir(join(homedir(), ".cowork"), { recursive: true });
  }

  async record(record: CostRecord): Promise<void> {
    const line = JSON.stringify(record) + "\n";
    try {
      const existing = existsSync(this.ledgerPath)
        ? await readFile(this.ledgerPath, "utf-8")
        : "";
      await writeFile(this.ledgerPath, existing + line, "utf-8");
    } catch {
      // never throw on telemetry failure
    }
  }

  async trackSession(opts: {
    sessionId: string;
    model: string;
    provider: string;
    projectRoot: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<CostRecord> {
    const costUsd = calculateCost(opts.model, opts.inputTokens, opts.outputTokens);
    const record: CostRecord = {
      ...opts,
      costUsd,
      timestamp: new Date().toISOString(),
    };
    await this.record(record);
    return record;
  }

  async summarize(days = 30): Promise<CostSummary> {
    if (!existsSync(this.ledgerPath)) {
      return {
        totalSessions: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        formattedCost: "$0.00",
        byModel: {},
        byProvider: {},
      };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const raw = await readFile(this.ledgerPath, "utf-8");
    const records = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as CostRecord; }
        catch { return null; }
      })
      .filter((r): r is CostRecord => r !== null)
      .filter((r) => new Date(r.timestamp) >= cutoff);

    const summary: CostSummary = {
      totalSessions: records.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      formattedCost: "",
      byModel: {},
      byProvider: {},
    };

    for (const r of records) {
      summary.totalInputTokens += r.inputTokens;
      summary.totalOutputTokens += r.outputTokens;
      summary.totalCostUsd += r.costUsd;

      if (!summary.byModel[r.model]) {
        summary.byModel[r.model] = { sessions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      summary.byModel[r.model]!.sessions++;
      summary.byModel[r.model]!.inputTokens += r.inputTokens;
      summary.byModel[r.model]!.outputTokens += r.outputTokens;
      summary.byModel[r.model]!.costUsd += r.costUsd;

      if (!summary.byProvider[r.provider]) {
        summary.byProvider[r.provider] = { sessions: 0, costUsd: 0 };
      }
      summary.byProvider[r.provider]!.sessions++;
      summary.byProvider[r.provider]!.costUsd += r.costUsd;
    }

    summary.formattedCost = formatCost(summary.totalCostUsd);
    return summary;
  }
}

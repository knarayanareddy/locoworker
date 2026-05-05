import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import type { SessionAnalytics, TurnStat } from "./types.js";

/**
 * Collects per-session analytics in-memory during a session,
 * then persists to ~/.cowork/analytics/<sessionId>.json on completion.
 */
export class SessionAnalyticsCollector {
  private analyticsDir: string;
  private data: SessionAnalytics;
  private toolTimers = new Map<string, number>();

  constructor(opts: {
    sessionId: string;
    projectRoot: string;
    provider: string;
    model: string;
  }) {
    this.analyticsDir = join(homedir(), ".cowork", "analytics");
    this.data = {
      sessionId: opts.sessionId,
      projectRoot: opts.projectRoot,
      provider: opts.provider,
      model: opts.model,
      startedAt: new Date().toISOString(),
      totalTurns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalToolCalls: 0,
      totalDurationMs: 0,
      costUsd: 0,
      toolUsage: [],
      turns: [],
    };
  }

  async init(): Promise<void> {
    await mkdir(this.analyticsDir, { recursive: true });
  }

  recordTurn(turn: TurnStat): void {
    this.data.turns.push(turn);
    this.data.totalTurns++;
    this.data.totalInputTokens += turn.inputTokens;
    this.data.totalOutputTokens += turn.outputTokens;
    this.data.totalToolCalls += turn.toolCalls;
    this.data.totalDurationMs += turn.durationMs;
  }

  recordToolStart(toolName: string): void {
    this.toolTimers.set(toolName + "_" + Date.now(), Date.now());
  }

  recordToolEnd(toolName: string, isError: boolean): void {
    // Find the oldest unmatched timer for this tool
    const key = [...this.toolTimers.keys()]
      .filter((k) => k.startsWith(toolName + "_"))
      .sort()[0];
    const startTime = key ? this.toolTimers.get(key) ?? Date.now() : Date.now();
    if (key) this.toolTimers.delete(key);

    const durationMs = Date.now() - startTime;

    let stat = this.data.toolUsage.find((t) => t.toolName === toolName);
    if (!stat) {
      stat = { toolName, callCount: 0, errorCount: 0, avgDurationMs: 0, totalDurationMs: 0 };
      this.data.toolUsage.push(stat);
    }
    stat.callCount++;
    if (isError) stat.errorCount++;
    stat.totalDurationMs += durationMs;
    stat.avgDurationMs = stat.totalDurationMs / stat.callCount;
  }

  complete(costUsd: number): void {
    this.data.completedAt = new Date().toISOString();
    this.data.costUsd = costUsd;
  }

  async persist(): Promise<void> {
    const path = join(this.analyticsDir, `${this.data.sessionId}.json`);
    await writeFile(path, JSON.stringify(this.data, null, 2), "utf-8");
  }

  getSnapshot(): SessionAnalytics {
    return { ...this.data };
  }
}

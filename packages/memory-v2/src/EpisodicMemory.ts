/**
 * Episodic Memory: stores timestamped "episodes" — structured records of
 * what the agent did, with whom, and what was decided.
 *
 * Complements the existing flat MemorySystem with temporal + causal structure.
 */

import { MemorySystem } from "@cowork/core";
import path from "path";
import mkdir from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Glob } from "bun";

export type EpisodeType =
  | "task"          // agent completed a task
  | "decision"      // agent/user made a decision
  | "discovery"     // agent found something important
  | "error"         // something went wrong (for learning)
  | "interaction"   // a significant user interaction
  | "insight";      // agent formed a new understanding

export interface Episode {
  id: string;
  type: EpisodeType;
  sessionId: string;
  title: string;
  summary: string;             // 1–2 sentence summary
  details?: string;            // full details if needed
  entities: string[];          // named entities (files, functions, people, concepts)
  outcome: "success" | "failure" | "partial" | "unknown";
  confidence: number;          // 0–1
  ts: string;                  // ISO timestamp
  durationMs?: number;
  toolsUsed?: string[];
  relatedEpisodeIds?: string[];  // causal/temporal links
  tags?: string[];
}

export class EpisodicMemory {
  private projectRoot: string;
  private episodesDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.episodesDir = path.join(
      MemorySystem.rootFor(projectRoot),
      "episodes"
    );
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async record(episode: Omit<Episode, "id" | "ts">): Promise<Episode> {
    // @ts-ignore
    await mkdir(this.episodesDir, { recursive: true });
    const full: Episode = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      ...episode,
    };

    const filename = `${full.ts.replace(/[:T]/g, "-").slice(0, 19)}-${full.type}-${full.id.slice(0, 8)}.json`;
    await Bun.write(
      path.join(this.episodesDir, filename),
      JSON.stringify(full, null, 2)
    );
    return full;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async recent(limit = 20): Promise<Episode[]> {
    const episodes = await this.loadAll();
    return episodes
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, limit);
  }

  async search(query: string, limit = 10): Promise<Episode[]> {
    const episodes = await this.loadAll();
    const q = query.toLowerCase();
    return episodes
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.entities.some((ent) => ent.toLowerCase().includes(q)) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, limit);
  }

  async byType(type: EpisodeType, limit = 20): Promise<Episode[]> {
    const episodes = await this.loadAll();
    return episodes
      .filter((e) => e.type === type)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, limit);
  }

  async getChain(episodeId: string): Promise<Episode[]> {
    const episodes = await this.loadAll();
    const epMap = new Map(episodes.map((e) => [e.id, e]));
    const chain: Episode[] = [];
    const visited = new Set<string>();

    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const ep = epMap.get(id);
      if (!ep) return;
      chain.push(ep);
      for (const relId of ep.relatedEpisodeIds ?? []) walk(relId);
    };

    walk(episodeId);
    return chain.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }

  // ── Statistics ─────────────────────────────────────────────────────────────

  async stats(): Promise<{
    total: number;
    byType: Record<EpisodeType, number>;
    successRate: number;
    avgConfidence: number;
    dateRange: { first: string; last: string } | null;
  }> {
    const episodes = await this.loadAll();
    if (episodes.length === 0) {
      return {
        total: 0,
        byType: {} as any,
        successRate: 0,
        avgConfidence: 0,
        dateRange: null,
      };
    }

    const byType: Record<string, number> = {};
    for (const ep of episodes) {
      byType[ep.type] = (byType[ep.type] ?? 0) + 1;
    }

    const successes = episodes.filter((e) => e.outcome === "success").length;

    return {
      total: episodes.length,
      byType: byType as any,
      successRate: successes / episodes.length,
      avgConfidence:
        episodes.reduce((s, e) => s + e.confidence, 0) / episodes.length,
      dateRange: {
        first: episodes[episodes.length - 1].ts,
        last: episodes[0].ts,
      },
    };
  }

  // ── Auto-record from agent events ──────────────────────────────────────────

  static fromAgentSession(opts: {
    sessionId: string;
    prompt: string;
    fullText: string;
    toolsCalled: string[];
    durationMs: number;
    success: boolean;
  }): Omit<Episode, "id" | "ts"> {
    return {
      type: "task",
      sessionId: opts.sessionId,
      title: opts.prompt.slice(0, 80),
      summary: opts.fullText.slice(0, 200),
      entities: opts.toolsCalled,
      outcome: opts.success ? "success" : "failure",
      confidence: opts.success ? 0.9 : 0.4,
      durationMs: opts.durationMs,
      toolsUsed: opts.toolsCalled,
    };
  }

  private async loadAll(): Promise<Episode[]> {
    const episodes: Episode[] = [];
    try {
      const glob = new Glob("*.json");
      for await (const file of glob.scan({
        cwd: this.episodesDir,
        onlyFiles: true,
      })) {
        try {
          const raw = await Bun.file(path.join(this.episodesDir, file)).text();
          episodes.push(JSON.parse(raw) as Episode);
        } catch { /* skip corrupt */ }
      }
    } catch { /* dir doesn't exist yet */ }
    return episodes;
  }
}

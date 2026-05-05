import type { ResearchConfig, ResearchJob, ResearchQueueEntry } from "./types";
import { MemorySystem, QueryEngine, resolveProvider } from "@cowork/core";
import { WikiStore } from "@cowork/wiki";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const QUEUE_FILE = "research-queue.json";
const JOBS_FILE = "research-jobs.json";

export class AutoResearch {
  private config: ResearchConfig;
  private queueDir: string;

  constructor(config: ResearchConfig) {
    this.config = { maxTurns: 6, outputToWiki: true, outputToMemory: true, ...config };
    this.queueDir = path.join(
      MemorySystem.rootFor(config.projectRoot),
      "research"
    );
  }

  // ── Queue management ───────────────────────────────────────────────────────

  async enqueue(question: string, priority = 5, tags?: string[]): Promise<string> {
    await mkdir(this.queueDir, { recursive: true });
    const queue = await this.loadQueue();
    const id = `research-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    queue.push({ id, question, priority, addedAt: new Date().toISOString(), tags });
    queue.sort((a, b) => b.priority - a.priority);
    await Bun.write(
      path.join(this.queueDir, QUEUE_FILE),
      JSON.stringify(queue, null, 2)
    );
    return id;
  }

  async listQueue(): Promise<ResearchQueueEntry[]> {
    return this.loadQueue();
  }

  // ── Background pass (called by KAIROS) ────────────────────────────────────

  async runBackgroundPass(): Promise<void> {
    const queue = await this.loadQueue();
    if (queue.length === 0) return;

    // Pop the highest-priority item
    const [entry, ...rest] = queue;
    await Bun.write(
      path.join(this.queueDir, QUEUE_FILE),
      JSON.stringify(rest, null, 2)
    );

    await this.runJob(entry.id, entry.question, entry.tags);
  }

  // ── Run a single research job ──────────────────────────────────────────────

  async runJob(id: string, question: string, tags?: string[]): Promise<ResearchJob> {
    const job: ResearchJob = {
      id,
      question,
      status: "running",
      startedAt: new Date().toISOString(),
    };

    await this.persistJob(job);

    try {
      const answer = await this.conductResearch(question);
      job.status = "done";
      job.completedAt = new Date().toISOString();
      job.answer = answer;

      // Persist to memory
      if (this.config.outputToMemory) {
        const memory = new MemorySystem({ projectRoot: this.config.projectRoot });
        await memory.save({
          type: "reference",
          name: `research: ${question.slice(0, 60)}`,
          description: `AutoResearch result for: ${question}`,
          body: answer,
          tags: ["autoResearch", ...(tags ?? [])],
          confidence: 0.8,
          sessionId: null,
        });
      }

      // Persist to wiki
      if (this.config.outputToWiki) {
        const wiki = new WikiStore(this.config.projectRoot);
        const slug = `research-${id}`;
        await wiki.upsertPage(slug, {
          title: `Research: ${question.slice(0, 80)}`,
          body: `## Question\n\n${question}\n\n## Answer\n\n${answer}`,
          tags: ["autoResearch", ...(tags ?? [])],
          sourceMemoryIds: [],
        });
        job.wikiSlug = slug;
      }
    } catch (err) {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = err instanceof Error ? err.message : String(err);
    }

    await this.persistJob(job);
    return job;
  }

  // ── Actual research logic ──────────────────────────────────────────────────

  private async conductResearch(question: string): Promise<string> {
    const providerConfig = resolveProvider({
      provider: this.config.provider as any,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      env: process.env as any,
    });

    const engine = new QueryEngine(providerConfig);

    const systemPrompt = [
      "You are an expert research assistant. Your task is to thoroughly answer a research question.",
      "Structure your answer with:",
      "1. A concise direct answer (1–2 paragraphs)",
      "2. Key supporting points or evidence",
      "3. Caveats or unknowns",
      "4. Actionable recommendations if applicable",
      "Be specific and technical. Avoid filler.",
    ].join("\n");

    const response = await engine.call({
      systemPrompt,
      messages: [{ role: "user", content: question }],
      tools: [],
      maxTokens: 2048,
    });

    // Extract text content from response blocks
    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");

    return text || "(no answer generated)";
  }

  // ── Persistence helpers ────────────────────────────────────────────────────

  private async loadQueue(): Promise<ResearchQueueEntry[]> {
    try {
      const raw = await Bun.file(path.join(this.queueDir, QUEUE_FILE)).text();
      return JSON.parse(raw) as ResearchQueueEntry[];
    } catch {
      return [];
    }
  }

  private async persistJob(job: ResearchJob): Promise<void> {
    await mkdir(this.queueDir, { recursive: true });
    let jobs: ResearchJob[] = [];
    try {
      const raw = await Bun.file(path.join(this.queueDir, JOBS_FILE)).text();
      jobs = JSON.parse(raw) as ResearchJob[];
    } catch { /* first time */ }

    const idx = jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) jobs[idx] = job;
    else jobs.push(job);

    await Bun.write(
      path.join(this.queueDir, JOBS_FILE),
      JSON.stringify(jobs, null, 2)
    );
  }
}

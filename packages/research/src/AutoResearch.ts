import type { ResearchJob, AutoResearchConfig } from "./types";
import {
  QueryEngine,
  resolveProvider,
  MemorySystem,
  type ContentBlock,
  type ProviderName,
} from "@cowork/core";
import { LLMWiki } from "@cowork/wiki";
import path from "path";
import { mkdir } from "node:fs/promises";
import { Glob } from "bun";

export class AutoResearch {
  private config: Required<AutoResearchConfig>;
  private queueDir: string;

  constructor(config: AutoResearchConfig) {
    this.config = {
      outputToWiki: true,
      outputToMemory: true,
      apiKey: undefined,
      baseUrl: undefined,
      verbose: false,
      ...config,
    } as Required<AutoResearchConfig>;

    this.queueDir = path.join(
      (MemorySystem as any).rootFor(config.projectRoot),
      "research"
    );
  }

  async enqueue(question: string): Promise<string> {
    await mkdir(this.queueDir, { recursive: true });
    const id = `research-${Date.now()}`;
    const job: ResearchJob = {
      id,
      question,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await Bun.write(this.jobPath(id), JSON.stringify(job, null, 2));
    return id;
  }

  /**
   * Called by KAIROS daemon — processes one queued job.
   */
  async runBackgroundPass(): Promise<void> {
    const jobs = await this.listJobs();
    const queued = jobs.find((j) => j.status === "queued");
    if (!queued) return;

    await this.runJob(queued.id, queued.question);
  }

  async runJob(id: string, question: string): Promise<ResearchJob> {
    const job = await this.updateStatus(id, "running");

    try {
      const answer = await this.performResearch(question);
      job.status = "done";
      job.answer = answer;
      job.updatedAt = new Date().toISOString();

      await Bun.write(this.jobPath(id), JSON.stringify(job, null, 2));

      if (this.config.outputToMemory) {
        const memory = new MemorySystem({ projectRoot: this.config.projectRoot });
        await memory.save({
          type: "reference",
          sessionId: "research-" + id,
          name: `Research: ${question.slice(0, 50)}...`,
          description: `Background research results for: ${question}`,
          body: answer,
          tags: ["research", "auto"],
          confidence: 0.8,
        });
      }

      if (this.config.outputToWiki) {
        const wiki = new LLMWiki({ projectRoot: this.config.projectRoot });
        await wiki.upsertPage(`research-${id}`, {
          title: `Research: ${question.slice(0, 50)}`,
          body: `## Question\n\n${question}\n\n## Answer\n\n${answer}`,
          tags: ["research"],
          sourceMemoryIds: [],
        });
      }

      return job;
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.updatedAt = new Date().toISOString();
      await Bun.write(this.jobPath(id), JSON.stringify(job, null, 2));
      return job;
    }
  }

  async listJobs(): Promise<ResearchJob[]> {
    await mkdir(this.queueDir, { recursive: true });
    const jobs: ResearchJob[] = [];
    const glob = new Glob("*.json");
    for await (const file of glob.scan({ cwd: this.queueDir, onlyFiles: true })) {
      try {
        const raw = await Bun.file(path.join(this.queueDir, file)).text();
        jobs.push(JSON.parse(raw) as ResearchJob);
      } catch { /* skip */ }
    }
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async performResearch(question: string): Promise<string> {
    const provider = resolveProvider({
      provider: this.config.provider as ProviderName,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      env: process.env,
    });
    const engine = new QueryEngine(provider);

    const system =
      "You are a research agent. Perform deep investigation on the user's question. " +
      "Provide a comprehensive, structured markdown answer. Use facts and avoid fluff.";

    const response = await engine.call({
      systemPrompt: system,
      messages: [{ role: "user", content: question }],
      tools: [],
    });
    
    return response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }

  private jobPath(id: string): string {
    return path.join(this.queueDir, `${id}.json`);
  }

  private async updateStatus(id: string, status: ResearchJob["status"]): Promise<ResearchJob> {
    const raw = await Bun.file(this.jobPath(id)).text();
    const job = JSON.parse(raw) as ResearchJob;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    await Bun.write(this.jobPath(id), JSON.stringify(job, null, 2));
    return job;
  }
}

import { queryLoop } from "@cowork/core";
import type { QueryEngine } from "@cowork/core";
import type { ResearchSession } from "../planner/types.js";
import type { WikiStore } from "@cowork/wiki";

const REPORTER_SYSTEM_PROMPT = `You are a research report writer.
Synthesize research findings into a clear, well-structured report.
Use markdown. Include: Executive Summary, Key Findings, Analysis, Conclusions, and Limitations.`;

export class ResearchReporter {
  constructor(private engine: QueryEngine, private wikiStore?: WikiStore) {}

  async generateReport(session: ResearchSession): Promise<string> {
    const stepsText = session.plan.steps
      .filter((s) => s.completed && s.result)
      .map((s) => `### ${s.description}\n${s.result}`)
      .join("\n\n");

    const findingsText = session.findings
      .map((f) => `- [${f.kind}] ${f.content} (confidence: ${f.confidence.toFixed(2)})`)
      .join("\n");

    const prompt = [
      `Research Question: ${session.question}`,
      ``,
      `Research Steps Completed:`,
      stepsText,
      ``,
      `Extracted Findings:`,
      findingsText,
      ``,
      `Write a comprehensive research report synthesizing all of the above.`,
    ].join("\n");

    let report = "";

    try {
      for await (const event of queryLoop(prompt, {
        engine: this.engine,
        systemPrompt: REPORTER_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
        maxTokens: 3000,
      })) {
        if (event.type === "text") report += event.text;
      }
    } catch {
      report = this.fallbackReport(session);
    }

    if (this.wikiStore && report) {
      const title = `Research: ${session.question.slice(0, 60)}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const existing = await this.wikiStore.getBySlug(slug);

      if (existing) {
        await this.wikiStore.update(existing.id, {
          sources: [...existing.sources, report],
          tags: [...new Set([...existing.tags, "research", "auto-generated"])],
        });
      } else {
        await this.wikiStore.create({
          title,
          sources: [report],
          body: report,
          tags: ["research", "auto-generated"],
          confidence: this.avgConfidence(session),
        });
      }
    }

    return report;
  }

  formatSummary(session: ResearchSession): string {
    const lines = [
      `## Research Summary`,
      `**Question:** ${session.question}`,
      `**Status:** ${session.status}`,
      `**Steps:** ${session.plan.steps.filter((s) => s.completed).length}/${session.plan.steps.length}`,
      `**Findings:** ${session.findings.length}`,
      `**Tokens:** ${session.totalInputTokens + session.totalOutputTokens}`,
      ``,
      `### Key Findings`,
      ...session.findings
        .filter((f) => f.confidence > 0.6)
        .slice(0, 10)
        .map((f) => `- ${f.content}`),
    ];
    return lines.join("\n");
  }

  private fallbackReport(session: ResearchSession): string {
    return [
      `# Research Report: ${session.question}`,
      ``,
      `## Findings`,
      ...session.findings.map((f) => `- ${f.content}`),
    ].join("\n");
  }

  private avgConfidence(session: ResearchSession): number {
    if (session.findings.length === 0) return 0.5;
    return (
      session.findings.reduce((s, f) => s + f.confidence, 0) /
      session.findings.length
    );
  }
}

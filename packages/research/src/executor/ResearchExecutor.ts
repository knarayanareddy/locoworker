import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine, ToolDefinition } from "@cowork/core";
import type { ResearchPlan, ResearchSession, ResearchFinding, ResearchStep } from "../planner/types.js";

const EXECUTOR_SYSTEM_PROMPT = `You are a research agent executing a specific research step.
Be precise, factual, and thorough. Cite your sources when possible.
If you discover contradictions or gaps in knowledge, explicitly call them out.
End each response with:
CONFIDENCE: <0.0-1.0>
KEY_FINDINGS: <bullet list of 1-3 key findings from this step>`;

export class ResearchExecutor {
  constructor(private engine: QueryEngine, private tools: ToolDefinition[]) {}

  async executeSession(
    plan: ResearchPlan,
    onStepComplete?: (step: ResearchStep, result: string) => void
  ): Promise<ResearchSession> {
    const session: ResearchSession = {
      id: randomUUID(),
      question: plan.question,
      plan,
      status: "in-progress",
      findings: [],
      startedAt: new Date().toISOString(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    const completed = new Set<string>();

    const executeStep = async (step: ResearchStep): Promise<void> => {
      while (step.dependsOn.some((dep) => !completed.has(dep))) {
        await new Promise((r) => setTimeout(r, 100));
      }

      const depContext = step.dependsOn
        .map((depId) => {
          const depStep = plan.steps.find((s) => s.id === depId);
          return depStep?.result ? `## ${depStep.description}\n${depStep.result}` : null;
        })
        .filter(Boolean)
        .join("\n\n");

      const prompt = depContext
        ? `Prior research context:\n${depContext}\n\nCurrent step: ${step.prompt}`
        : step.prompt;

      let result = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        for await (const event of queryLoop(prompt, {
          engine: this.engine,
          systemPrompt: EXECUTOR_SYSTEM_PROMPT,
          tools: this.tools,
          maxTurns: 5,
          requestApproval: async () => true,
        })) {
          if (event.type === "text") result += event.text;
          if (event.type === "complete") {
            inputTokens = event.usage?.inputTokens ?? 0;
            outputTokens = event.usage?.outputTokens ?? 0;
          }
        }
      } catch (err) {
        result = `Step failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      step.completed = true;
      step.result = result;
      step.tokens = { input: inputTokens, output: outputTokens };
      session.totalInputTokens += inputTokens;
      session.totalOutputTokens += outputTokens;

      const findings = this.extractFindings(result, step.id);
      session.findings.push(...findings);

      completed.add(step.id);
      onStepComplete?.(step, result);
    };

    await Promise.all(plan.steps.map((step) => executeStep(step)));

    session.status = "complete";
    session.completedAt = new Date().toISOString();

    return session;
  }

  private extractFindings(result: string, stepId: string): ResearchFinding[] {
    const findings: ResearchFinding[] = [];

    const confMatch = result.match(/CONFIDENCE:\s*([\d.]+)/i);
    const confidence = confMatch ? parseFloat(confMatch[1]!) : 0.7;

    const keyFindingsMatch = result.match(/KEY_FINDINGS:\s*\n?((?:[-•].+\n?)+)/i);
    if (keyFindingsMatch) {
      const bullets = keyFindingsMatch[1]!
        .split("\n")
        .filter((l) => l.trim().match(/^[-•]/))
        .map((l) => l.replace(/^[-•]\s*/, "").trim());

      for (const bullet of bullets) {
        if (bullet) {
          findings.push({
            id: randomUUID(),
            stepId,
            kind: "fact",
            content: bullet,
            confidence,
          });
        }
      }
    }

    return findings;
  }
}

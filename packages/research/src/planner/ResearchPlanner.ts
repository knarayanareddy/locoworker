import { randomUUID } from "node:crypto";
import { queryLoop } from "@cowork/core";
import type { QueryEngine } from "@cowork/core";
import type { ResearchPlan, ResearchStep, ResearchStepKind } from "./types.js";

const PLANNER_SYSTEM_PROMPT = `You are a research planning expert.
Given a research question, create a structured step-by-step research plan.

Each step should have:
- A kind: search | read | analyze | synthesize | verify | write
- A clear description
- A specific prompt for the agent to execute

Format each step as:
STEP [kind]: <description>
PROMPT: <specific agent prompt for this step>
DEPENDS_ON: <comma-separated step numbers, or "none">
---

Be thorough but efficient. Typical plans have 4-8 steps.`;

export class ResearchPlanner {
  constructor(private engine: QueryEngine) {}

  async plan(question: string): Promise<ResearchPlan> {
    let rawOutput = "";

    try {
      for await (const event of queryLoop(
        `Create a research plan for this question:\n\n${question}`,
        {
          engine: this.engine,
          systemPrompt: PLANNER_SYSTEM_PROMPT,
          tools: [],
          maxTurns: 1,
          maxTokens: 2000,
        }
      )) {
        if (event.type === "text") rawOutput += event.text;
      }
    } catch {
      return this.fallbackPlan(question);
    }

    const steps = this.parseSteps(rawOutput);

    return {
      id: randomUUID(),
      question,
      steps,
      createdAt: new Date().toISOString(),
    };
  }

  private parseSteps(raw: string): ResearchStep[] {
    const stepBlocks = raw.split("---").filter((b) => b.trim());
    const steps: ResearchStep[] = [];

    for (let i = 0; i < stepBlocks.length; i++) {
      const block = stepBlocks[i]!;
      const kindMatch = block.match(/STEP\s+\[(\w+)\]:\s*(.+?)(?=\nPROMPT:|$)/s);
      const promptMatch = block.match(/PROMPT:\s*(.+?)(?=\nDEPENDS_ON:|---$|$)/s);
      const depsMatch = block.match(/DEPENDS_ON:\s*(.+)/);

      if (!kindMatch || !promptMatch) continue;

      const kind = (kindMatch[1]?.toLowerCase() ?? "analyze") as ResearchStepKind;
      const description = kindMatch[2]?.trim() ?? "";
      const prompt = promptMatch[1]?.trim() ?? "";
      const depsRaw = depsMatch?.[1]?.trim() ?? "none";

      const dependsOn =
        depsRaw === "none"
          ? []
          : depsRaw
              .split(",")
              .map((d) => {
                const num = parseInt(d.trim(), 10) - 1;
                return steps[num]?.id ?? "";
              })
              .filter(Boolean);

      steps.push({
        id: randomUUID(),
        kind,
        description,
        prompt,
        dependsOn,
        completed: false,
      });
    }

    return steps.length > 0 ? steps : this.fallbackPlan("").steps;
  }

  private fallbackPlan(question: string): ResearchPlan {
    return {
      id: randomUUID(),
      question,
      steps: [
        {
          id: randomUUID(),
          kind: "analyze",
          description: "Analyze and answer the research question",
          prompt: question,
          dependsOn: [],
          completed: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };
  }
}

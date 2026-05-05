import { PermissionLevel, type ToolDefinition } from "@cowork/core";
import type { ResearchPlanner } from "../planner/ResearchPlanner.js";
import type { ResearchExecutor } from "../executor/ResearchExecutor.js";
import type { ResearchReporter } from "../reporter/ResearchReporter.js";

export function makeResearchTools(
  planner: ResearchPlanner,
  executor: ResearchExecutor,
  reporter: ResearchReporter
): ToolDefinition[] {
  return [
    {
      name: "research",
      description:
        "Run a full AutoResearch loop: plan → execute → report. " +
        "Best for complex multi-step questions that require structured investigation.",
      permissionLevel: PermissionLevel.STANDARD,
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The research question to investigate." },
          save_to_wiki: { type: "boolean", description: "If true, save the report to the project wiki." },
        },
        required: ["question"],
      },
      async execute(input: { question: string; save_to_wiki?: boolean }) {
        try {
          process.stderr.write(`[research] Planning: ${input.question.slice(0, 60)}\n`);
          const plan = await planner.plan(input.question);

          process.stderr.write(`[research] Executing ${plan.steps.length} steps...\n`);
          const session = await executor.executeSession(plan, (step) => {
            process.stderr.write(`[research] ✓ ${step.description}\n`);
          });

          process.stderr.write(`[research] Generating report...\n`);
          const report = await reporter.generateReport(session);

          return {
            content: [reporter.formatSummary(session), ``, `## Full Report`, report].join("\n"),
            isError: false,
          };
        } catch (err) {
          return {
            content: `Research failed: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },

    {
      name: "research_plan",
      description: "Generate a research plan without executing it. Useful for reviewing the approach before committing.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The research question." },
        },
        required: ["question"],
      },
      async execute(input: { question: string }) {
        try {
          const plan = await planner.plan(input.question);
          const lines = [
            `Research plan for: "${input.question}"`,
            `Steps: ${plan.steps.length}`,
            ``,
            ...plan.steps.map(
              (s, i) =>
                `${i + 1}. [${s.kind}] ${s.description}${s.dependsOn.length ? ` (depends on: ${s.dependsOn.length} prior steps)` : ""}`
            ),
          ];
          return { content: lines.join("\n"), isError: false };
        } catch (err) {
          return {
            content: `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      },
    },
  ];
}

import { queryLoop } from "../queryLoop.js";
import type { QueryEngine } from "../QueryEngine.js";
import type { ToolDefinition } from "../Tool.js";
import type { ReActStep } from "./types.js";

const REACT_SYSTEM_PROMPT = `You are a ReAct (Reason + Act) agent.
For each step, FIRST reason about what to do, THEN decide on an action.

Format your response as:
THOUGHT: <your reasoning about the current situation>
ACTION: <tool_name or "FINAL_ANSWER">
ACTION_INPUT: <JSON input for the tool, or your final answer text>

If you have enough information to answer, use ACTION: FINAL_ANSWER.`;

export class ReActPlanner {
  constructor(
    private engine: QueryEngine,
    private tools: ToolDefinition[],
    private maxCycles = 5
  ) {}

  async plan(prompt: string): Promise<{ steps: ReActStep[]; finalAnswer: string }> {
    const steps: ReActStep[] = [];
    let context = prompt;

    for (let cycle = 0; cycle < this.maxCycles; cycle++) {
      let rawOutput = "";

      try {
        for await (const event of queryLoop(context, {
          engine: this.engine,
          systemPrompt: REACT_SYSTEM_PROMPT,
          tools: [],
          maxTurns: 1,
          maxTokens: 800,
        })) {
          if (event.type === "text") rawOutput += event.text;
        }
      } catch {
        break;
      }

      const thought = rawOutput.match(/THOUGHT:\s*(.+?)(?=\nACTION:|$)/s)?.[1]?.trim() ?? "";
      const action = rawOutput.match(/ACTION:\s*(.+?)(?=\nACTION_INPUT:|$)/s)?.[1]?.trim() ?? "";
      const actionInputRaw =
        rawOutput.match(/ACTION_INPUT:\s*([\s\S]+)/)?.[1]?.trim() ?? "";

      if (action === "FINAL_ANSWER") {
        steps.push({ thought, action, actionInput: null, observation: actionInputRaw });
        return { steps, finalAnswer: actionInputRaw };
      }

      let actionInput: unknown = actionInputRaw;
      try {
        actionInput = JSON.parse(actionInputRaw);
      } catch {
        // raw string input is fine
      }

      const tool = this.tools.find((t) => t.name === action);
      let observation = `Tool "${action}" not found.`;

      if (tool) {
        try {
          const result = await tool.execute(actionInput as Record<string, unknown>, {
            workingDirectory: process.cwd(),
            sessionId: "react-planner",
            permissionLevel: 2,
          } as Parameters<typeof tool.execute>[1]);
          observation = result.content;
        } catch (err) {
          observation = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      steps.push({ thought, action, actionInput, observation });

      context = [
        prompt,
        ``,
        `Previous steps:`,
        ...steps.map(
          (s, i) =>
            `Step ${i + 1}: THOUGHT: ${s.thought}\nACTION: ${s.action}\nOBSERVATION: ${s.observation}`
        ),
        ``,
        `Continue reasoning based on the observations above.`,
      ].join("\n");
    }

    const finalAnswer = steps
      .filter((s) => s.observation)
      .map((s) => s.observation)
      .join("\n");

    return { steps, finalAnswer };
  }
}

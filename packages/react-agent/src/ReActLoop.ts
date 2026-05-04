/**
 * ReAct (Reasoning + Acting) agent loop.
 *
 * Unlike the standard queryLoop which relies on the provider's native
 * tool-call support, ReAct uses explicit Thought → Action → Observation
 * text-based reasoning. This makes it compatible with ANY text model
 * (including models that don't support native tool calling).
 *
 * Format per turn:
 *   Thought: <reasoning about what to do next>
 *   Action: <ToolName>
 *   Action Input: <json_args>
 *   Observation: <tool result>
 *   ... repeat ...
 *   Final Answer: <answer>
 */

import { QueryEngine, resolveProvider, type ToolDefinition, type ToolContext, type ResolvedSettings } from "@cowork/core";

export interface ReActConfig {
  settings: ResolvedSettings;
  tools: ToolDefinition[];
  maxSteps?: number;             // default 10
  projectRoot: string;
  verbose?: boolean;
}

export interface ReActStep {
  stepNum: number;
  thought: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  observation?: string;
  isFinal: boolean;
  finalAnswer?: string;
  error?: string;
}

export interface ReActResult {
  finalAnswer: string;
  steps: ReActStep[];
  totalSteps: number;
  success: boolean;
}

const SYSTEM_PROMPT_TEMPLATE = (toolDescs: string) => `You are a ReAct agent. You solve tasks by reasoning step by step and using tools.

Available tools:
${toolDescs}

Use this EXACT format for each step:
Thought: <your reasoning about what to do next>
Action: <ToolName>
Action Input: <JSON object matching the tool's input schema>
Observation: <you will receive the tool result here>

When you have the final answer, use:
Thought: I now have the final answer.
Final Answer: <your complete answer>

Rules:
- Always start with a Thought
- Only use tools from the list above
- Action Input must be valid JSON
- Never skip Thought
- Stop with Final Answer when complete`;

export class ReActLoop {
  private config: ReActConfig;
  private engine: QueryEngine;

  constructor(config: ReActConfig) {
    this.config = { maxSteps: 10, ...config };
    const providerCfg = resolveProvider({
      provider: config.settings.provider,
      model: config.settings.model,
    });
    this.engine = new QueryEngine(providerCfg);
  }

  async run(task: string): Promise<ReActResult> {
    const toolMap = new Map(this.config.tools.map((t) => [t.name, t]));

    const toolDescs = this.config.tools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");

    const systemPrompt = SYSTEM_PROMPT_TEMPLATE(toolDescs);
    const steps: ReActStep[] = [];
    let scratchpad = `Task: ${task}`;
    let stepNum = 0;

    while (stepNum < (this.config.maxSteps ?? 10)) {
      stepNum++;
      const prompt = `${scratchpad}\n\nStep ${stepNum}:`;

      const response = await this.engine.call({
        systemPrompt,
        messages: [{ role: "user", content: prompt }],
        tools: [],
        maxTokens: 1024,
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (this.config.verbose) {
        console.error(`[ReAct] Step ${stepNum}:\n${text}\n`);
      }

      const step = this.parseStep(stepNum, text);
      steps.push(step);

      // Final answer — we're done
      if (step.isFinal) {
        return {
          finalAnswer: step.finalAnswer ?? "(no answer)",
          steps,
          totalSteps: stepNum,
          success: true,
        };
      }

      // Execute the action
      if (step.action) {
        const tool = toolMap.get(step.action);
        let observation: string;

        if (!tool) {
          observation = `Error: Tool "${step.action}" not found. Available: ${[...toolMap.keys()].join(", ")}`;
        } else {
          try {
            const ctx: ToolContext = {
              workingDirectory: this.config.projectRoot,
              settings: this.config.settings,
              tools: this.config.tools,
            };
            const result = await tool.execute(step.actionInput ?? {}, ctx);
            observation = result.content.slice(0, 2000);
          } catch (err) {
            observation = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        step.observation = observation;
        // Append to scratchpad
        scratchpad += `\n\nThought: ${step.thought}\nAction: ${step.action}\nAction Input: ${JSON.stringify(step.actionInput ?? {})}\nObservation: ${observation}`;
      } else {
        // Model didn't produce an action — force it to continue or stop
        scratchpad += `\n\nThought: ${step.thought}`;
        if (stepNum >= (this.config.maxSteps ?? 10) - 1) break;
      }
    }

    return {
      finalAnswer: "(max steps reached without final answer)",
      steps,
      totalSteps: stepNum,
      success: false,
    };
  }

  private parseStep(stepNum: number, text: string): ReActStep {
    const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\n(?:Action|Final Answer)|$)/i);
    const actionMatch = text.match(/Action:\s*(\w+)/i);
    const inputMatch = text.match(/Action Input:\s*(\{[\s\S]*?\})/i);
    const finalMatch = text.match(/Final Answer:\s*([\s\S]+)$/i);

    const thought = thoughtMatch?.[1]?.trim() ?? text.slice(0, 200);
    const isFinal = !!finalMatch;
    const finalAnswer = finalMatch?.[1]?.trim();
    const action = actionMatch?.[1]?.trim();

    let actionInput: Record<string, unknown> = {};
    if (inputMatch?.[1]) {
      try {
        actionInput = JSON.parse(inputMatch[1]);
      } catch { /* keep empty */ }
    }

    return { stepNum, thought, action, actionInput, isFinal, finalAnswer };
  }
}

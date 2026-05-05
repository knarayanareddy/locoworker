import type { Message } from "../../types.js";
import type { QueryEngine } from "../../QueryEngine.js";

export interface FullCompactResult {
  messages: Message[];
  summary: string;
  decisionsMade: string[];
  factsLearned: string[];
  openQuestions: string[];
  originalMessageCount: number;
  compactedMessageCount: number;
}

export async function fullCompact(
  messages: Message[],
  engine: QueryEngine,
  systemPrompt: string
): Promise<FullCompactResult> {
  // Render history to plain text
  const transcript = messages
    .map((m) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : m.content
              .map((b) => {
                if (b.type === "text") return b.text;
                if (b.type === "tool_use") return `[Tool: ${b.name}(${JSON.stringify(b.input).slice(0, 200)})]`;
                if (b.type === "tool_result") return `[Result: ${String(b.content).slice(0, 200)}]`;
                return "";
              })
              .join("\n");
      return `${m.role.toUpperCase()}: ${content}`;
    })
    .join("\n\n");

  const prompt = [
    "You are a session compactor. Analyze the following conversation transcript and produce a structured summary.",
    "",
    "Extract:",
    "1. A 2-3 sentence narrative summary",
    "2. DECISIONS_MADE: bullet list of concrete decisions/actions taken",
    "3. FACTS_LEARNED: bullet list of facts, file contents, or code structures discovered",
    "4. OPEN_QUESTIONS: bullet list of unresolved questions or pending work",
    "",
    "Format your response EXACTLY as:",
    "SUMMARY: <narrative>",
    "DECISIONS_MADE:",
    "- <decision>",
    "FACTS_LEARNED:",
    "- <fact>",
    "OPEN_QUESTIONS:",
    "- <question>",
    "",
    "## Transcript",
    transcript.slice(0, 40_000),
  ].join("\n");

  let rawOutput = "";
  try {
    const response = await engine.call({
      systemPrompt: "You are a precise session compactor.",
      messages: [{ role: "user", content: prompt }],
      tools: [],
      maxTokens: 2000,
    });

    rawOutput = (response.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text ?? "" : ""))
      .join("");
  } catch {
    // Fall back to simple truncation on model failure
    return {
      messages: messages.slice(-4),
      summary: "Session compacted due to context length.",
      decisionsMade: [],
      factsLearned: [],
      openQuestions: [],
      originalMessageCount: messages.length,
      compactedMessageCount: 4,
    };
  }

  // Parse structured output
  const summary = rawOutput.match(/SUMMARY:\s*(.+?)(?=\nDECISIONS_MADE:|$)/s)?.[1]?.trim() ?? "";
  const decisions = extractBullets(rawOutput, "DECISIONS_MADE");
  const facts = extractBullets(rawOutput, "FACTS_LEARNED");
  const questions = extractBullets(rawOutput, "OPEN_QUESTIONS");

  // Build compacted message set
  const compactedContent = [
    `**Session Summary**\n${summary}`,
    decisions.length ? `**Decisions Made**\n${decisions.map((d) => `- ${d}`).join("\n")}` : "",
    facts.length ? `**Facts Learned**\n${facts.map((f) => `- ${f}`).join("\n")}` : "",
    questions.length ? `**Open Questions**\n${questions.map((q) => `- ${q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const compactedMessages: Message[] = [
    {
      role: "user",
      content: `[Session history compacted. ${messages.length} messages → structured summary]\n\n${compactedContent}`,
    },
    {
      role: "assistant",
      content: "Understood. I have the session context from the compact summary and will continue from here.",
    },
  ];

  return {
    messages: compactedMessages,
    summary,
    decisionsMade: decisions,
    factsLearned: facts,
    openQuestions: questions,
    originalMessageCount: messages.length,
    compactedMessageCount: compactedMessages.length,
  };
}

function extractBullets(text: string, section: string): string[] {
  const match = text.match(new RegExp(`${section}:\\s*\\n((?:- .+\\n?)+)`, "i"));
  if (!match) return [];
  return match[1]!
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.replace(/^- /, "").trim());
}

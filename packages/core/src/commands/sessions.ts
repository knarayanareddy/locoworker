import type { SlashCommand } from "./SlashCommand.js";

export const sessionsCommand: SlashCommand = {
  name: "sessions",
  description: "List recent sessions or show a specific session.",
  usage: "/sessions [limit]",
  async execute(args, ctx) {
    if (!ctx.sessionManager) {
      ctx.print("Session manager not available.");
      return;
    }

    const limit = parseInt(args[0] || "20", 10) || 20;
    const sessions = await ctx.sessionManager.list(limit);
    if (sessions.length === 0) {
      ctx.print("No sessions found.");
      return;
    }

    const lines = sessions.map((s) => {
      const date = s.createdAt.slice(0, 16).replace("T", " ");
      const status = s.status === "complete" ? "✓" : s.status === "active" ? "●" : "✗";
      const cost = (s.totalInputTokens || 0) + (s.totalOutputTokens || 0);
      return `${status} ${date}  ${s.id.slice(0, 8)}  turns:${s.turns}  tokens:${cost}  ${s.summary?.slice(0, 50) ?? ""}`;
    });

    const report = [
      `Recent sessions (${sessions.length}):`,
      `  ST  DATE              ID        TURNS  TOKENS  SUMMARY`,
      ...lines.map((l) => `  ${l}`),
    ].join("\n");
    ctx.print(report);
  },
};

// packages/core/src/commands/session.ts
// Slash commands: /session list | /session show <id> | /session delete <id>

import type { SlashCommand } from "./SlashCommand.js";

export const sessionListCommand: SlashCommand = {
  name: "session",
  description: "List recent sessions. Usage: /session [list|show <id>|delete <id>]",
  async execute(args: string[], ctx) {
    const sub = args[0] ?? "list";

    if (!ctx.sessionManager) {
      ctx.print("Session manager not available in this context.");
      return;
    }

    if (sub === "list" || !sub) {
      const sessions = await ctx.sessionManager.list();
      if (sessions.length === 0) {
        ctx.print("No sessions recorded yet.");
        return;
      }
      ctx.print(`\nRecent sessions (${sessions.length}):\n`);
      for (const s of sessions.slice(0, 20)) {
        const updated = new Date(s.updatedAt).toLocaleString();
        ctx.print(
          `  ${s.id.slice(0, 8)}  [${s.status}]  ${s.name}  — ${s.provider}/${s.model}  (${updated})`
        );
      }
      ctx.print("");
      return;
    }

    if (sub === "show") {
      const id = args[1];
      if (!id) { ctx.print("Usage: /session show <id>"); return; }
      const session = await ctx.sessionManager.get(id);
      if (!session) { ctx.print(`Session "${id}" not found.`); return; }
      ctx.print(JSON.stringify(session, null, 2));
      return;
    }

    if (sub === "delete") {
      const id = args[1];
      if (!id) { ctx.print("Usage: /session delete <id>"); return; }
      const deleted = await ctx.sessionManager.delete(id);
      ctx.print(deleted ? `Session "${id}" deleted.` : `Session "${id}" not found.`);
      return;
    }

    ctx.print(`Unknown sub-command "${sub}". Use: list | show <id> | delete <id>`);
  },
};

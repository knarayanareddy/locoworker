import type { SlashCommand } from "./SlashCommand.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getCoworkHome } from "../state/Settings.js";

export const auditCommand: SlashCommand = {
  name: "audit",
  description: "Show today's audit log entries.",
  usage: "/audit [limit]",
  async execute(args, ctx) {
    const today = new Date().toISOString().slice(0, 10);
    const logPath = join(getCoworkHome(), "audit", `${today}.ndjson`);

    if (!existsSync(logPath)) {
      ctx.print(`No audit log for today (${today}).`);
      return;
    }

    try {
      const raw = await readFile(logPath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      const limit = parseInt(args[0] || "20", 10) || 20;
      const recent = lines.slice(-limit);

      const formatted = recent.map((line) => {
        try {
          const e = JSON.parse(line) as {
            timestamp: string;
            kind: string;
            toolName?: string;
            outcome: string;
            reason?: string;
          };
          const time = e.timestamp.slice(11, 19);
          const tool = e.toolName ? `/${e.toolName}` : "";
          const reason = e.reason ? ` — ${e.reason.slice(0, 60)}` : "";
          return `  ${time}  ${e.kind.padEnd(18)}${tool.padEnd(20)} ${e.outcome}${reason}`;
        } catch {
          return `  ${line.slice(0, 80)}`;
        }
      });

      ctx.print([
        `Audit log — ${today} (${lines.length} entries, showing last ${recent.length}):`,
        `  TIME      KIND               TOOL                 OUTCOME`,
        ...formatted,
      ].join("\n"));
    } catch (err) {
      ctx.print(`Failed to read audit log: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

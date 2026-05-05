// packages/core/src/commands/registry.ts
// Slash command registry — includes Phase 5 commands.

import type { SlashCommand, SlashCommandContext } from "./SlashCommand.js";
import { memoryListCommand, memorySearchCommand, memoryClearCommand, dreamCommand }
  from "./memory.js";
import { sessionListCommand } from "./session.js";
import { sessionsCommand } from "./sessions.js";
import { skillsCommand } from "./skills.js";
import { telemetryCommand } from "./telemetry.js";
import { auditCommand } from "./audit.js";
import { analyticsCommand } from "./analytics.js";
import { researchCommand } from "./research.js";
import { councilCommand } from "./council.js";
import { simulateCommand } from "./simulate.js";
import { kairosCommand } from "./kairos.js";
import { hermesCommand } from "./hermes.js";
import { healthCommand } from "./health.js";
import { ultraplanCommand } from "./ultraplan.js";
import { forecastCommand } from "./miroforecast.js";


export class SlashRegistry {
  private readonly commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  async dispatch(line: string, ctx: SlashCommandContext): Promise<boolean> {
    if (!line.startsWith("/")) return false;
    const withoutSlash = line.slice(1).trimStart();
    const spaceIdx = withoutSlash.indexOf(" ");
    const cmdName = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? "" : withoutSlash.slice(spaceIdx + 1);


    // Exact match first
    let cmd = this.commands.get(cmdName);

    // Prefix match (shortest unique prefix)
    if (!cmd) {
      const matches = [...this.commands.keys()].filter((k) => k.startsWith(cmdName));
      if (matches.length === 1) cmd = this.commands.get(matches[0]!);
    }

    if (!cmd) {
      ctx.print(`Unknown command: /${cmdName}. Type /help for a list.`);
      return true;
    }

    const argsArr = args.trim().split(/\s+/).filter(Boolean);
    await cmd.execute(argsArr, ctx);
    return true;
  }

  list(): SlashCommand[] {
    return [...this.commands.values()];
  }
}

export function defaultRegistry(): SlashRegistry {
  const r = new SlashRegistry();

  // Built-in commands
  r.register({
    name: "help",
    description: "List available commands",
    async execute(_args: string[], ctx) {
      const cmds = r.list();
      ctx.print("\nAvailable commands:");
      for (const c of cmds) {
        ctx.print(`  /${c.name.padEnd(20)} ${c.description}`);
      }
      ctx.print("");
    },
  });

  r.register({
    name: "exit",
    description: "Exit the REPL",
    async execute(_args: string[], _ctx) {
      process.exit(0);
    },
  });

  r.register({
    name: "quit",
    description: "Exit the REPL",
    async execute(_args: string[], _ctx) {
      process.exit(0);
    },
  });

  r.register({
    name: "clear",
    description: "Clear the terminal",
    async execute(_args: string[], ctx) {
      process.stdout.write("\x1b[2J\x1b[H");
      ctx.print("Screen cleared.");
    },
  });

  r.register({
    name: "provider",
    description: "Show current provider and model",
    async execute(_args: string[], ctx) {
      ctx.print("Use --provider and --model flags to change provider at startup.");
    },
  });

  r.register({
    name: "compact",
    description: "Manually trigger context compaction",
    async execute(_args: string[], ctx) {
      if (!ctx.compressor) {
        ctx.print("No compressor configured.");
        return;
      }
      ctx.print("Compaction runs automatically when the context ceiling is approached.");
    },
  });

  // Phase 2: memory commands
  r.register(memoryListCommand);
  r.register(memorySearchCommand);
  r.register(memoryClearCommand);
  r.register(dreamCommand);

  // Phase 5 & 6 commands
  r.register(sessionListCommand);
  r.register(sessionsCommand);
  r.register(skillsCommand);
  r.register(telemetryCommand);
  r.register(auditCommand);
  r.register(analyticsCommand);

  // Phase 7 commands
  r.register(researchCommand);
  r.register(councilCommand);
  r.register(simulateCommand);
  r.register(kairosCommand);
  r.register(hermesCommand);
  r.register(healthCommand);
  r.register(ultraplanCommand);
  r.register(forecastCommand);

  return r;
}

import type { SlashCommand, SlashCommandContext, SlashOutput } from "./SlashCommand.js";
import {
  memoryListCommand,
  memorySearchCommand,
  memoryClearCommand,
  dreamCommand,
} from "./memory.js";

export class SlashRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  registerAll(cmds: SlashCommand[]): void {
    for (const c of cmds) this.register(c);
  }

  list(): SlashCommand[] {
    return Array.from(this.commands.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Match either by exact name or shortest unique prefix. */
  resolve(name: string): SlashCommand | null {
    const exact = this.commands.get(name);
    if (exact) return exact;
    const candidates = this.list().filter((c) => c.name.startsWith(name));
    return candidates.length === 1 ? candidates[0] ?? null : null;
  }

  async dispatch(line: string, ctx: SlashCommandContext): Promise<SlashOutput | null> {
    if (!line.startsWith("/")) return null;
    const tokens = line.slice(1).trim().split(/\s+/);
    const head = tokens[0];
    if (!head) return null;
    const rest = tokens.slice(1);
    const cmd = this.resolve(head);
    if (!cmd) return { type: "text", text: `unknown command: /${head}` };
    return cmd.execute(rest, ctx);
  }
}

const helpCommand: SlashCommand = {
  name: "help",
  summary: "Show available slash commands",
  async execute(_args, _ctx): Promise<SlashOutput> {
    const cmds = defaultRegistry().list();
    const text = cmds.map((c) => `  /${c.name.padEnd(18)} ${c.summary}`).join("\n");
    return { type: "text", text };
  },
};

const exitCommand: SlashCommand = {
  name: "exit",
  summary: "Quit the REPL",
  async execute(): Promise<SlashOutput> {
    return { type: "exit" };
  },
};

const quitCommand: SlashCommand = {
  name: "quit",
  summary: "Quit the REPL (alias for /exit)",
  async execute(): Promise<SlashOutput> {
    return { type: "exit" };
  },
};

const clearCommand: SlashCommand = {
  name: "clear",
  summary: "Clear the screen",
  async execute(): Promise<SlashOutput> {
    return { type: "clear" };
  },
};

const compactCommand: SlashCommand = {
  name: "compact",
  summary: "Tell the next turn it should run AutoCompact (no-op standalone)",
  async execute(_args, _ctx): Promise<SlashOutput> {
    return { type: "text", text: "compaction is automatic at 85% of the context window" };
  },
};

const providerCommand: SlashCommand = {
  name: "provider",
  summary: "Show the active provider and model",
  async execute(_args, ctx): Promise<SlashOutput> {
    return { type: "text", text: `${ctx.engine.providerName} · ${ctx.engine.model}` };
  },
};

export function defaultRegistry(): SlashRegistry {
  const registry = new SlashRegistry();
  registry.registerAll([
    helpCommand,
    exitCommand,
    quitCommand,
    clearCommand,
    providerCommand,
    compactCommand,
    memoryListCommand,
    memorySearchCommand,
    memoryClearCommand,
    dreamCommand,
  ]);
  return registry;
}

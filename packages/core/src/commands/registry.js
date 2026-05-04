import { memoryListCommand, memorySearchCommand, memoryClearCommand, dreamCommand, } from "./memory.js";
export class SlashRegistry {
    commands = new Map();
    register(cmd) {
        this.commands.set(cmd.name, cmd);
    }
    registerAll(cmds) {
        for (const c of cmds)
            this.register(c);
    }
    list() {
        return Array.from(this.commands.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    /** Match either by exact name or shortest unique prefix. */
    resolve(name) {
        const exact = this.commands.get(name);
        if (exact)
            return exact;
        const candidates = this.list().filter((c) => c.name.startsWith(name));
        return candidates.length === 1 ? candidates[0] ?? null : null;
    }
    async dispatch(line, ctx) {
        if (!line.startsWith("/"))
            return null;
        const tokens = line.slice(1).trim().split(/\s+/);
        const head = tokens[0];
        if (!head)
            return null;
        const rest = tokens.slice(1);
        const cmd = this.resolve(head);
        if (!cmd)
            return { type: "text", text: `unknown command: /${head}` };
        return cmd.execute(rest, ctx);
    }
}
const helpCommand = {
    name: "help",
    summary: "Show available slash commands",
    async execute(_args, _ctx) {
        const cmds = defaultRegistry().list();
        const text = cmds.map((c) => `  /${c.name.padEnd(18)} ${c.summary}`).join("\n");
        return { type: "text", text };
    },
};
const exitCommand = {
    name: "exit",
    summary: "Quit the REPL",
    async execute() {
        return { type: "exit" };
    },
};
const quitCommand = {
    name: "quit",
    summary: "Quit the REPL (alias for /exit)",
    async execute() {
        return { type: "exit" };
    },
};
const clearCommand = {
    name: "clear",
    summary: "Clear the screen",
    async execute() {
        return { type: "clear" };
    },
};
const compactCommand = {
    name: "compact",
    summary: "Tell the next turn it should run AutoCompact (no-op standalone)",
    async execute(_args, _ctx) {
        return { type: "text", text: "compaction is automatic at 85% of the context window" };
    },
};
const providerCommand = {
    name: "provider",
    summary: "Show the active provider and model",
    async execute(_args, ctx) {
        return { type: "text", text: `${ctx.engine.providerName} · ${ctx.engine.model}` };
    },
};
export function defaultRegistry() {
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
//# sourceMappingURL=registry.js.map
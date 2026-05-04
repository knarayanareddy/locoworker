import { isMemoryType, MEMORY_TYPES } from "../memdir/MemoryTypes.js";
import { AutoDream } from "../memdir/AutoDream.js";
export const memoryListCommand = {
    name: "memory",
    summary: "List stored memories. Usage: /memory [type] [limit]",
    usage: "/memory [user|feedback|project|reference] [limit]",
    async execute(args, ctx) {
        const filter = {};
        for (const a of args) {
            if (isMemoryType(a))
                filter.type = a;
            else if (/^\d+$/.test(a))
                filter.limit = Number(a);
        }
        const entries = await ctx.memory.list(filter);
        if (entries.length === 0)
            return { type: "text", text: "no memories" };
        const text = entries
            .map((e) => `  ${e.type}/${e.id}  ${e.name}\n    ${e.description}  ${e.tags.length ? "[" + e.tags.join(", ") + "]" : ""}`)
            .join("\n");
        return { type: "text", text };
    },
};
export const memorySearchCommand = {
    name: "memory-search",
    summary: "Search memories with hybrid BM25 + vector ranking",
    usage: "/memory-search <query>",
    async execute(args, ctx) {
        if (args.length === 0)
            return { type: "text", text: "usage: /memory-search <query>" };
        const query = args.join(" ");
        const results = await ctx.memory.query(query, 5);
        if (results.length === 0)
            return { type: "text", text: `no matches for "${query}"` };
        const text = results
            .map((r) => `  ${r.entry.type}/${r.entry.id}  (score=${r.score.toFixed(3)}, ${r.via.join("+")})\n    ${r.entry.name} — ${r.entry.description}`)
            .join("\n");
        return { type: "text", text };
    },
};
export const memoryClearCommand = {
    name: "memory-clear",
    summary: "Delete a memory. Usage: /memory-clear <type> <id>",
    usage: "/memory-clear <type> <id>",
    async execute(args, ctx) {
        if (args.length < 2 || !args[0] || !args[1]) {
            return { type: "text", text: "usage: /memory-clear <type> <id>" };
        }
        const type = args[0];
        const id = args[1];
        if (!isMemoryType(type)) {
            return { type: "text", text: `unknown type "${type}". use one of ${MEMORY_TYPES.join(", ")}` };
        }
        const ok = await ctx.memory.delete(type, id);
        return { type: "text", text: ok ? `deleted ${type}/${id}` : `not found: ${type}/${id}` };
    },
};
export const dreamCommand = {
    name: "dream",
    summary: "Run AutoDream — consolidate, prune, and re-index memory",
    usage: "/dream [--with-model]",
    async execute(args, ctx) {
        const withModel = args.includes("--with-model");
        const dream = new AutoDream(ctx.memory);
        const report = withModel
            ? await dream.consolidateWithModel(ctx.engine)
            : await dream.consolidate();
        const text = [
            `dream complete:`,
            `  scanned             ${report.scanned}`,
            `  duplicates merged   ${report.duplicatesMerged}`,
            `  stale removed       ${report.staleRemoved}`,
            `  datestamps fixed    ${report.datestampsFixed}`,
            `  contradictions      ${report.contradictionsResolved}`,
            `  remaining           ${report.finalCount}`,
        ].join("\n");
        return { type: "text", text };
    },
};
//# sourceMappingURL=memory.js.map
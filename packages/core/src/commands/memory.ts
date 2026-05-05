import { isMemoryType, MEMORY_TYPES, type MemoryType } from "../memdir/MemoryTypes.js";
import { AutoDream } from "../memdir/AutoDream.js";
import type { SlashCommand } from "./SlashCommand.js";

export const memoryListCommand: SlashCommand = {
  name: "memory",
  description: "List stored memories. Usage: /memory [type] [limit]",
  usage: "/memory [user|feedback|project|reference] [limit]",
  async execute(args, ctx): Promise<void> {
    const filter: { type?: MemoryType; limit?: number } = {};
    for (const a of args) {
      if (isMemoryType(a)) filter.type = a;
      else if (/^\d+$/.test(a)) filter.limit = Number(a);
    }
    const entries = await ctx.memory.list(filter);
    if (entries.length === 0) {
      ctx.print("no memories");
      return;
    }
    const text = entries
      .map(
        (e) =>
          `  ${e.type}/${e.id}  ${e.name}\n    ${e.description}  ${(e.tags ?? []).length ? "[" + e.tags.join(", ") + "]" : ""}`,
      )
      .join("\n");
    ctx.print(text);
  },
};

export const memorySearchCommand: SlashCommand = {
  name: "memory-search",
  description: "Search memories with hybrid BM25 + vector ranking",
  usage: "/memory-search <query>",
  async execute(args, ctx): Promise<void> {
    if (args.length === 0) {
      ctx.print("usage: /memory-search <query>");
      return;
    }
    const query = args.join(" ");
    const results = await ctx.memory.query(query, 5);
    if (results.length === 0) {
      ctx.print(`no matches for "${query}"`);
      return;
    }
    const text = results
      .map(
        (r) =>
          `  ${r.entry.type}/${r.entry.id}  (score=${r.score.toFixed(3)}, ${r.via.join("+")})\n    ${r.entry.name} — ${r.entry.description}`,
      )
      .join("\n");
    ctx.print(text);
  },
};

export const memoryClearCommand: SlashCommand = {
  name: "memory-clear",
  description: "Delete a memory. Usage: /memory-clear <type> <id>",
  usage: "/memory-clear <type> <id>",
  async execute(args, ctx): Promise<void> {
    if (args.length < 2 || !args[0] || !args[1]) {
      ctx.print("usage: /memory-clear <type> <id>");
      return;
    }
    const type = args[0];
    const id = args[1];
    if (!isMemoryType(type)) {
      ctx.print(`unknown type "${type}". use one of ${MEMORY_TYPES.join(", ")}`);
      return;
    }
    const ok = await ctx.memory.delete(type, id);
    ctx.print(ok ? `deleted ${type}/${id}` : `not found: ${type}/${id}`);
  },
};

export const dreamCommand: SlashCommand = {
  name: "dream",
  description: "Run AutoDream — consolidate, prune, and re-index memory",
  usage: "/dream [--with-model]",
  async execute(args, ctx): Promise<void> {
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
    ctx.print(text);
  },
};

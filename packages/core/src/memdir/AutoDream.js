const RELATIVE_DATE_HINTS = [
    "yesterday",
    "today",
    "tomorrow",
    "last week",
    "this week",
    "next week",
];
export class AutoDream {
    memory;
    constructor(memory) {
        this.memory = memory;
    }
    /** Mechanical consolidation pass — no model call. Always safe to run. */
    async consolidate() {
        const all = await this.memory.list();
        const report = {
            scanned: all.length,
            duplicatesMerged: 0,
            staleRemoved: 0,
            datestampsFixed: 0,
            contradictionsResolved: 0,
            finalCount: 0,
        };
        // 1. Duplicate detection: same type + identical normalized body.
        const seen = new Map();
        for (const entry of all) {
            const key = `${entry.type}::${normalizeBody(entry.body)}`;
            const existing = seen.get(key);
            if (!existing) {
                seen.set(key, entry);
                continue;
            }
            // Keep the more recent / higher-confidence one, delete the other.
            const winner = preferEntry(existing, entry);
            const loser = winner === existing ? entry : existing;
            seen.set(key, winner);
            await this.memory.delete(loser.type, loser.id);
            report.duplicatesMerged++;
        }
        // 2. Datestamp relative dates in body text.
        for (const entry of seen.values()) {
            const updated = stampRelativeDates(entry.body, entry.updatedAt);
            if (updated !== entry.body) {
                await this.memory.save({
                    ...entry,
                    body: updated,
                });
                report.datestampsFixed++;
            }
        }
        // 3. Prune obvious staleness: confidence dropped to ~0.
        for (const entry of seen.values()) {
            if (entry.confidence <= 0.05) {
                await this.memory.delete(entry.type, entry.id);
                report.staleRemoved++;
            }
        }
        await this.memory.rebuildIndex();
        const remaining = await this.memory.list();
        report.finalCount = remaining.length;
        return report;
    }
    /**
     * Optional second pass: ask a model to find semantic duplicates and
     * contradictions that the deterministic pass can't see. This is the
     * "REM sleep" half of AutoDream from the spec; it costs API calls so
     * gate it behind an explicit invocation.
     */
    async consolidateWithModel(engine) {
        const mechanical = await this.consolidate();
        const all = await this.memory.list();
        if (all.length < 2)
            return mechanical;
        const summary = all
            .map((e) => `[${e.type}] ${e.id}\n  name: ${e.name}\n  body: ${e.body.slice(0, 400)}`)
            .join("\n\n");
        try {
            const response = await engine.call({
                systemPrompt: DREAM_PROMPT,
                messages: [{ role: "user", content: summary }],
                tools: [],
                maxTokens: 2_000,
            });
            const text = textOnly(response);
            const verdicts = parseDreamVerdicts(text);
            for (const v of verdicts) {
                const entry = all.find((e) => e.id === v.id);
                if (!entry)
                    continue;
                if (v.action === "delete") {
                    await this.memory.delete(entry.type, entry.id);
                    mechanical.contradictionsResolved++;
                }
            }
            await this.memory.rebuildIndex();
        }
        catch {
            // If the model call fails the mechanical pass is still valid.
        }
        return mechanical;
    }
}
const DREAM_PROMPT = `You are reviewing a list of long-term memory entries for a coding agent.

For each entry decide one of:
  KEEP   — leave it alone
  DELETE — it contradicts a more recent entry, or is stale, or is a near-duplicate of another entry that says the same thing better

Output one line per decision in this exact form (no other commentary):
  <id> <KEEP|DELETE> <one-line reason>

Be conservative — when in doubt, KEEP.`;
function normalizeBody(body) {
    return body.toLowerCase().replace(/\s+/g, " ").trim();
}
function preferEntry(a, b) {
    if (a.confidence !== b.confidence)
        return a.confidence > b.confidence ? a : b;
    return a.updatedAt >= b.updatedAt ? a : b;
}
function stampRelativeDates(body, anchor) {
    let out = body;
    const anchorDate = new Date(anchor);
    for (const hint of RELATIVE_DATE_HINTS) {
        if (!out.toLowerCase().includes(hint))
            continue;
        const re = new RegExp(`\\b${hint}\\b`, "gi");
        out = out.replace(re, `${hint} (≈${anchorDate.toISOString().slice(0, 10)})`);
    }
    return out;
}
function textOnly(response) {
    return response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
}
function parseDreamVerdicts(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([\w\-_.]+)\s+(KEEP|DELETE)\s+(.+)$/i);
        if (!m || !m[1] || !m[2])
            continue;
        out.push({
            id: m[1],
            action: m[2].toUpperCase() === "DELETE" ? "delete" : "keep",
            reason: (m[3] ?? "").trim(),
        });
    }
    return out;
}
//# sourceMappingURL=AutoDream.js.map
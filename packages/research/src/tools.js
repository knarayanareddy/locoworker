import { PermissionLevel } from "@cowork/core";
import { AutoResearch } from "./AutoResearch.js";
export const ResearchEnqueue = {
    name: "ResearchEnqueue",
    description: "Add a research question to the AutoResearch queue. " +
        "KAIROS will process it in the background and store the answer in memory + wiki.",
    inputSchema: {
        type: "object",
        properties: {
            question: { type: "string", description: "The research question to investigate" },
            priority: {
                type: "number",
                description: "Priority 1–10 (10 = highest). Default 5.",
            },
            tags: { type: "array", items: { type: "string" } },
        },
        required: ["question"],
    },
    permissionLevel: PermissionLevel.STANDARD,
    async execute(input, ctx) {
        const research = new AutoResearch({
            projectRoot: ctx.workingDirectory,
            provider: ctx.settings?.provider ?? "ollama",
            model: ctx.settings?.model ?? "qwen2.5-coder:7b",
        });
        const id = await research.enqueue(input.question, input.priority ?? 5, input.tags);
        return {
            content: `Research job "${id}" queued (priority: ${input.priority ?? 5})`,
            isError: false,
        };
    },
};
export const ResearchNow = {
    name: "ResearchNow",
    description: "Immediately conduct a research pass on a question (synchronous, may take ~30s). " +
        "Stores the result in memory and wiki.",
    inputSchema: {
        type: "object",
        properties: {
            question: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
        },
        required: ["question"],
    },
    permissionLevel: PermissionLevel.STANDARD,
    async execute(input, ctx) {
        const research = new AutoResearch({
            projectRoot: ctx.workingDirectory,
            provider: ctx.settings?.provider ?? "ollama",
            model: ctx.settings?.model ?? "qwen2.5-coder:7b",
            outputToWiki: true,
            outputToMemory: true,
        });
        const id = `now-${Date.now()}`;
        const job = await research.runJob(id, input.question, input.tags);
        if (job.status === "failed") {
            return { content: `Research failed: ${job.error}`, isError: true };
        }
        return {
            content: `## Research Result\n\n**Q:** ${job.question}\n\n${job.answer}`,
            isError: false,
        };
    },
};
export const RESEARCH_TOOLS = [ResearchEnqueue, ResearchNow];
/** Alias for compatibility with session.ts if it expects a factory */
export function makeResearchTools(..._args) {
    return RESEARCH_TOOLS;
}
//# sourceMappingURL=tools.js.map
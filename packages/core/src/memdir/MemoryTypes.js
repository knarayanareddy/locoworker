/**
 * Memory architecture — spec PART 6.
 *
 * Four typed memory categories. Each entry lives as a single Markdown file
 * under ~/.cowork/projects/<project>/memory/<type>/<id>.md and is summarized
 * in MEMORY.md (the always-loaded index, hard-capped at 200 lines).
 */
export const MEMORY_TYPES = [
    "user",
    "feedback",
    "project",
    "reference",
];
export const DESCRIPTIONS = {
    user: "Who the user is, their role, expertise, preferences. Tailors how the agent communicates and what it can assume.",
    feedback: "Corrections and validated approaches. 'Don't do X' and 'yes, keep doing Y'. Should include the reason and when it applies.",
    project: "Decisions, deadlines, ownership, and motivations specific to the current work. Decays quickly — reverify against current state.",
    reference: "Pointers to external systems where authoritative information lives (Linear, dashboards, runbooks, etc).",
};
export function isMemoryType(s) {
    return MEMORY_TYPES.includes(s);
}
//# sourceMappingURL=MemoryTypes.js.map
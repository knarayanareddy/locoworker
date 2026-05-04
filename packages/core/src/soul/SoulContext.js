/**
 * SOUL.md — persona / identity context for the agent.
 * Inspired by the OpenClaw "SOUL.md" pattern:
 * a file that tells the agent who it is, who the user is, and how they work together.
 *
 * SOUL.md is loaded once and injected as the FIRST block of the system prompt —
 * before base instructions — to establish identity before anything else.
 */
import path from "path";
const SOUL_FILENAME = "SOUL.md";
const SOUL_MAX_CHARS = 4_000;
export async function loadSoulContext(projectRoot) {
    // Check project root first, then ~/.cowork/
    const candidates = [
        path.join(projectRoot, SOUL_FILENAME),
        path.join(projectRoot, ".cowork", SOUL_FILENAME),
        path.join(process.env.HOME ?? "~", ".cowork", SOUL_FILENAME),
    ];
    for (const candidate of candidates) {
        try {
            const content = await Bun.file(candidate).text();
            return {
                content: content.slice(0, SOUL_MAX_CHARS),
                path: candidate,
                loaded: true,
            };
        }
        catch { /* try next */ }
    }
    return { content: "", path: "", loaded: false };
}
export function defaultSoulTemplate() {
    return `# SOUL.md — Agent Persona

## Who I am
I am a focused coding and research assistant. I think carefully before acting,
prefer targeted edits over rewrites, and always explain my reasoning.

## Who you are
You are a developer working on this project. You value accuracy and clear communication.

## How we work together
- I will ask for clarification when requirements are ambiguous
- I will not make unrequested changes
- I will flag risky operations before executing them
- I maintain memory across sessions so you don't have to repeat context

## My constraints
- I do not execute commands that modify system files without explicit approval
- I do not store sensitive information (keys, passwords) in memory
- I prefer reading files over guessing their contents
`;
}
export async function ensureSoulFile(projectRoot) {
    const filePath = path.join(projectRoot, SOUL_FILENAME);
    try {
        await Bun.file(filePath).text();
        // File exists, don't overwrite
    }
    catch {
        await Bun.write(filePath, defaultSoulTemplate());
    }
}
//# sourceMappingURL=SoulContext.js.map
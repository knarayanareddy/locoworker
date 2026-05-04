/**
 * SOUL.md — persona / identity context for the agent.
 * Inspired by the OpenClaw "SOUL.md" pattern:
 * a file that tells the agent who it is, who the user is, and how they work together.
 *
 * SOUL.md is loaded once and injected as the FIRST block of the system prompt —
 * before base instructions — to establish identity before anything else.
 */
export interface SoulContext {
    content: string;
    path: string;
    loaded: boolean;
}
export declare function loadSoulContext(projectRoot: string): Promise<SoulContext>;
export declare function defaultSoulTemplate(): string;
export declare function ensureSoulFile(projectRoot: string): Promise<void>;
//# sourceMappingURL=SoulContext.d.ts.map
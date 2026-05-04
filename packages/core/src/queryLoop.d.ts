import { QueryEngine } from "./QueryEngine.js";
import { ContextCompressor } from "./services/compact/ContextCompressor.js";
import type { ToolDefinition } from "./Tool.js";
import type { PermissionLevel } from "./permissions/PermissionLevel.js";
import type { AgentEvent, ContentBlock } from "./types.js";
export type AgentLoopConfig = {
    engine: QueryEngine;
    tools: ToolDefinition[];
    systemPrompt: string;
    workingDirectory: string;
    permissionLevel: PermissionLevel;
    maxTurns?: number;
    maxTokens?: number;
    requestApproval?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
    abortSignal?: AbortSignal;
    /** Optional. When set, MicroCompact runs on tool results and AutoCompact runs near the ceiling. */
    compressor?: ContextCompressor;
    /** Optional hook called once per turn after the model response is appended. */
    onTurn?: (turn: number, response: {
        content: ContentBlock[];
    }) => void | Promise<void>;
};
/**
 * The heart: an async generator that runs the model in a loop, executing
 * any tool calls it produces and feeding the results back as the next
 * user-role turn. Yields events the CLI/UI can stream.
 */
export declare function queryLoop(userInput: string, config: AgentLoopConfig): AsyncGenerator<AgentEvent>;
//# sourceMappingURL=queryLoop.d.ts.map
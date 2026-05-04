import { type ToolDefinition } from "../../Tool.js";
import type { MemorySystem } from "../../memdir/MemorySystem.js";
type SaveInput = {
    type: string;
    name: string;
    description: string;
    body: string;
    tags?: string[];
};
export declare function makeMemorySaveTool(memory: MemorySystem, sessionId: string): ToolDefinition<SaveInput>;
export {};
//# sourceMappingURL=MemorySaveTool.d.ts.map
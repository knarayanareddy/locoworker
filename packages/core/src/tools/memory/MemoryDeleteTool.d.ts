import { type ToolDefinition } from "../../Tool.js";
import type { MemorySystem } from "../../memdir/MemorySystem.js";
type DeleteInput = {
    type: string;
    id: string;
};
export declare function makeMemoryDeleteTool(memory: MemorySystem): ToolDefinition<DeleteInput>;
export {};
//# sourceMappingURL=MemoryDeleteTool.d.ts.map
import { type ToolDefinition } from "../../Tool.js";
import type { MemorySystem } from "../../memdir/MemorySystem.js";
type SearchInput = {
    query: string;
    type?: string;
    limit?: number;
};
export declare function makeMemorySearchTool(memory: MemorySystem): ToolDefinition<SearchInput>;
export {};
//# sourceMappingURL=MemorySearchTool.d.ts.map
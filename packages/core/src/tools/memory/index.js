import { makeMemorySaveTool } from "./MemorySaveTool.js";
import { makeMemorySearchTool } from "./MemorySearchTool.js";
import { makeMemoryDeleteTool } from "./MemoryDeleteTool.js";
export { makeMemorySaveTool, makeMemorySearchTool, makeMemoryDeleteTool };
export function makeMemoryTools(memory, sessionId) {
    return [
        makeMemorySaveTool(memory, sessionId),
        makeMemorySearchTool(memory),
        makeMemoryDeleteTool(memory),
    ];
}
//# sourceMappingURL=index.js.map
import { BashTool } from "./bash/BashTool.js";
import { ReadFileTool } from "./files/ReadFileTool.js";
import { WriteFileTool } from "./files/WriteFileTool.js";
import { EditFileTool } from "./files/EditFileTool.js";
import { GlobTool } from "./files/GlobTool.js";
import { GrepTool } from "./files/GrepTool.js";
export const DEFAULT_TOOLS = [
    ReadFileTool,
    WriteFileTool,
    EditFileTool,
    GlobTool,
    GrepTool,
    BashTool,
];
export function buildToolMap(tools) {
    return new Map(tools.map((t) => [t.name, t]));
}
export { BashTool, ReadFileTool, WriteFileTool, EditFileTool, GlobTool, GrepTool, };
//# sourceMappingURL=index.js.map
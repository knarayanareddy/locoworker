import { type ToolDefinition } from "../../Tool.js";
type GrepInput = {
    pattern: string;
    path?: string;
    glob?: string;
    caseInsensitive?: boolean;
    context?: number;
};
export declare const GrepTool: ToolDefinition<GrepInput>;
export {};
//# sourceMappingURL=GrepTool.d.ts.map
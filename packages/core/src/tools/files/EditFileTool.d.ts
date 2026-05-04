import { type ToolDefinition } from "../../Tool.js";
type EditInput = {
    path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
};
export declare const EditFileTool: ToolDefinition<EditInput>;
export {};
//# sourceMappingURL=EditFileTool.d.ts.map
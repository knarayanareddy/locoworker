import type { ToolDefinition } from "../Tool.js";
export interface MCPServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    transport: "stdio";
}
export declare class MCPRegistry {
    private clients;
    register(config: MCPServerConfig): Promise<void>;
    getAllTools(): Promise<ToolDefinition[]>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=MCPRegistry.d.ts.map
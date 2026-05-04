import type { ToolDefinition } from "../Tool.js";
/**
 * A client for Model Context Protocol (MCP) servers using stdio transport.
 * Implements a subset of JSON-RPC 2.0 to fetch and execute tools.
 */
export declare class MCPClient {
    private name;
    private command;
    private args;
    private env;
    private proc;
    private nextId;
    private pending;
    constructor(name: string, command: string, args?: string[], env?: Record<string, string>);
    connect(): Promise<void>;
    close(): Promise<void>;
    listTools(): Promise<ToolDefinition[]>;
    private call;
    private readLoop;
}
//# sourceMappingURL=MCPClient.d.ts.map
import { spawn } from "bun";
import { PermissionLevel } from "../permissions/PermissionLevel.js";
/**
 * A client for Model Context Protocol (MCP) servers using stdio transport.
 * Implements a subset of JSON-RPC 2.0 to fetch and execute tools.
 */
export class MCPClient {
    name;
    command;
    args;
    env;
    proc = null;
    nextId = 1;
    pending = new Map();
    constructor(name, command, args = [], env = {}) {
        this.name = name;
        this.command = command;
        this.args = args;
        this.env = env;
    }
    async connect() {
        this.proc = spawn([this.command, ...this.args], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "inherit",
            env: { ...process.env, ...this.env },
        });
        void this.readLoop();
    }
    async close() {
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }
    async listTools() {
        const response = await this.call("list_tools", {});
        const mcpTools = response.tools;
        return mcpTools.map((t) => ({
            name: `${this.name}_${t.name}`,
            description: t.description,
            inputSchema: t.inputSchema ?? { type: "object" },
            permissionLevel: PermissionLevel.STANDARD, // default to standard for external tools
            execute: async (input, ctx) => {
                try {
                    const res = await this.call("call_tool", { name: t.name, arguments: input });
                    return { content: JSON.stringify(res.content), isError: res.isError ?? false };
                }
                catch (err) {
                    return { content: String(err), isError: true };
                }
            },
        }));
    }
    async call(method, params) {
        if (!this.proc)
            throw new Error(`MCP server "${this.name}" not connected`);
        const id = this.nextId++;
        const request = { jsonrpc: "2.0", id, method, params };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            if (this.proc?.stdin && typeof this.proc.stdin !== "number") {
                this.proc.stdin.write(JSON.stringify(request) + "\n");
            }
        });
    }
    async readLoop() {
        if (!this.proc?.stdout || typeof this.proc.stdout === "number")
            return;
        const reader = this.proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const response = JSON.parse(line);
                        if (response.id !== undefined) {
                            const p = this.pending.get(response.id);
                            if (p) {
                                this.pending.delete(response.id);
                                if (response.error)
                                    p.reject(response.error);
                                else
                                    p.resolve(response.result);
                            }
                        }
                    }
                    catch { /* skip invalid json */ }
                }
            }
        }
        catch (err) {
            console.error(`[MCP] ${this.name} read error:`, err);
        }
    }
}
//# sourceMappingURL=MCPClient.js.map
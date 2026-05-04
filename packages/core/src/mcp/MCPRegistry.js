import { MCPClient } from "./MCPClient.js";
export class MCPRegistry {
    clients = new Map();
    async register(config) {
        if (this.clients.has(config.name))
            return;
        const client = new MCPClient(config.name, config.command, config.args ?? [], config.env ?? {});
        await client.connect();
        this.clients.set(config.name, client);
    }
    async getAllTools() {
        const allTools = [];
        for (const client of this.clients.values()) {
            try {
                const tools = await client.listTools();
                allTools.push(...tools);
            }
            catch (err) {
                console.warn(`[MCP] Failed to list tools for client:`, err);
            }
        }
        return allTools;
    }
    async shutdown() {
        for (const client of this.clients.values()) {
            await client.close();
        }
        this.clients.clear();
    }
}
//# sourceMappingURL=MCPRegistry.js.map
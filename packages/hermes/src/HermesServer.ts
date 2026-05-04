/**
 * Hermes: exposes cowork tools as an MCP server.
 * Other agents (Claude Desktop, cursor, other cowork instances) can
 * connect to Hermes and call cowork tools as MCP tools.
 *
 * Supports:
 *   - stdio transport (piped through stdin/stdout, standard MCP)
 *   - SSE transport (HTTP + Server-Sent Events for remote agents)
 */

import type { HermesConfig, MCPRequest, MCPResponse, MCPToolSchema } from "./types";
import type { ToolDefinition, ToolContext } from "@cowork/core";
import { DEFAULT_TOOLS, resolveSettings } from "@cowork/core";
import { EXTENDED_TOOLS } from "@cowork/core";
import { WIKI_TOOLS } from "@cowork/wiki";

export class HermesServer {
  private config: HermesConfig;
  private tools: ToolDefinition[];
  private httpServer?: ReturnType<typeof Bun.serve>;

  constructor(config: HermesConfig) {
    this.config = { port: 3722, transport: "stdio", verbose: false, ...config };
    // Build the tool list to expose
    const allTools = [...DEFAULT_TOOLS, ...EXTENDED_TOOLS, ...WIKI_TOOLS];
    this.tools = config.tools
      ? allTools.filter((t) => config.tools!.includes(t.name))
      : allTools;
  }

  async start(): Promise<void> {
    if (this.config.transport === "stdio") {
      await this.runStdio();
    } else {
      await this.runSSE();
    }
  }

  // ── stdio transport ────────────────────────────────────────────────────────

  private async runStdio(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    process.stdin.setEncoding("utf-8");

    for await (const chunk of process.stdin) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk as Buffer);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line) as MCPRequest;
          const res = await this.handleRequest(req);
          process.stdout.write(JSON.stringify(res) + "\n");
        } catch (err) {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            }) + "\n"
          );
        }
      }
    }
  }

  // ── SSE transport ──────────────────────────────────────────────────────────

  private async runSSE(): Promise<void> {
    const self = this;
    this.httpServer = Bun.serve({
      port: this.config.port,
      fetch(req) {
        return self.handleHttpRequest(req);
      },
    });
    console.error(
      `[Hermes] MCP SSE server running on http://localhost:${this.config.port}`
    );
    // Keep alive
    await new Promise<never>(() => {});
  }

  private async handleHttpRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Auth check
    if (this.config.authToken) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${this.config.authToken}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await req.json() as MCPRequest;
      const res = await this.handleRequest(body);
      return Response.json(res);
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", tools: this.tools.length });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Request router ─────────────────────────────────────────────────────────

  private async handleRequest(req: MCPRequest): Promise<MCPResponse> {
    try {
      switch (req.method) {
        case "initialize":
          return this.ok(req.id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "hermes", version: "0.1.0" },
          });

        case "tools/list":
          return this.ok(req.id, { tools: this.buildSchemas() });

        case "tools/call": {
          const params = req.params as { name: string; arguments: Record<string, unknown> };
          const result = await this.callTool(params.name, params.arguments);
          return this.ok(req.id, result);
        }

        default:
          return this.err(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      return this.err(req.id, -32000, err instanceof Error ? err.message : String(err));
    }
  }

  // ── Tool execution ─────────────────────────────────────────────────────────

  private async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    const settings = await resolveSettings(this.config.projectRoot, process.env, {});
    const ctx: ToolContext = {
      workingDirectory: this.config.projectRoot,
      settings,
      tools: this.tools,
    };

    try {
      const result = await tool.execute(args, ctx);
      return {
        content: [{ type: "text", text: result.content }],
        isError: result.isError,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // ── Schema helpers ─────────────────────────────────────────────────────────

  private buildSchemas(): MCPToolSchema[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  private ok(id: MCPRequest["id"], result: unknown): MCPResponse {
    return { jsonrpc: "2.0", id, result };
  }

  private err(id: MCPRequest["id"], code: number, message: string): MCPResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }
}

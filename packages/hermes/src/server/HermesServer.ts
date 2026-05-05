import type { ToolDefinition } from "@cowork/core";
import type {
  HermesConfig,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./types.js";

/**
 * HermesServer exposes locoworker tools as an MCP server.
 *
 * Transport: stdio (reads from stdin, writes to stdout as NDJSON)
 * Future: SSE transport (HTTP server with /sse endpoint) - Phase 8
 */
export class HermesServer {
  private tools: Map<string, ToolDefinition>;
  private config: HermesConfig;
  private running = false;

  constructor(config: HermesConfig, tools: ToolDefinition[]) {
    this.config = config;

    const allowlist = new Set(config.toolAllowlist ?? []);
    const filtered =
      allowlist.size > 0 ? tools.filter((t) => allowlist.has(t.name)) : tools;

    this.tools = new Map(filtered.map((t) => [t.name, t]));
  }

  async startStdio(): Promise<void> {
    if (this.running) return;
    this.running = true;

    process.stderr.write(
      `[hermes] MCP server started (stdio, ${this.tools.size} tools exposed)\n`
    );

    let buffer = "";

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        void this.handleLine(line);
      }
    });

    process.stdin.on("end", () => {
      this.running = false;
    });

    await new Promise<void>((resolve) => {
      process.stdin.once("end", resolve);
    });
  }

  startSse(): void {
    if (!this.config.port) {
      throw new Error("[hermes] SSE transport requires a port.");
    }

    const self = this;

    Bun.serve({
      port: this.config.port,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);

        if (self.config.authToken) {
          const auth = req.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (token !== self.config.authToken) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        if (url.pathname === "/sse") {
          return self.handleSse(req);
        }

        if (req.method === "POST" && url.pathname === "/message") {
          return self.handleHttpMessage(req);
        }

        if (url.pathname === "/health") {
          return new Response(
            JSON.stringify({ ok: true, tools: [...self.tools.keys()] }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    process.stderr.write(
      `[hermes] MCP server started (SSE, port ${this.config.port}, ${this.tools.size} tools exposed)\n`
    );
  }

  private async handleLine(line: string): Promise<void> {
    try {
      const req = JSON.parse(line) as McpJsonRpcRequest;
      const response = await this.dispatch(req);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const errResponse: McpJsonRpcResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: {
          code: -32700,
          message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
      process.stdout.write(JSON.stringify(errResponse) + "\n");
    }
  }

  private async handleHttpMessage(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as McpJsonRpcRequest;
      const response = await this.dispatch(body);
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          error: { code: -32700, message: "Parse error" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private handleSse(_req: Request): Response {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue("data: {\"type\":\"ready\"}\n\n");
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  private async dispatch(
    req: McpJsonRpcRequest
  ): Promise<McpJsonRpcResponse> {
    const respond = (result: unknown): McpJsonRpcResponse => ({
      jsonrpc: "2.0",
      id: req.id,
      result,
    });

    const respondError = (code: number, message: string): McpJsonRpcResponse => ({
      jsonrpc: "2.0",
      id: req.id,
      error: { code, message },
    });

    switch (req.method) {
      case "initialize":
        return respond({
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: this.config.serverName ?? "locoworker-hermes",
            version: this.config.serverVersion ?? "0.1.0",
          },
        });

      case "tools/list":
        return respond({
          tools: [...this.tools.values()].map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const params = req.params as {
          name: string;
          arguments?: unknown;
        } | undefined;

        if (!params?.name) {
          return respondError(-32602, "Missing tool name");
        }

        const tool = this.tools.get(params.name);
        if (!tool) {
          return respondError(-32602, `Unknown tool: ${params.name}`);
        }

        try {
          const result = await tool.execute((params.arguments as Record<string, unknown>) ?? {}, {
            workingDirectory: process.cwd(),
            sessionId: "hermes",
            permissionLevel: 3,
          } as Parameters<typeof tool.execute>[1]);

          return respond({
            content: [{ type: "text", text: result.content }],
            isError: result.isError,
          });
        } catch (err) {
          return respond({
            content: [
              {
                type: "text",
                text: err instanceof Error ? err.message : String(err),
              },
            ],
            isError: true,
          });
        }
      }

      case "shutdown":
        return respond({});

      default:
        return respondError(-32601, `Method not found: ${req.method}`);
    }
  }
}

import type { ExecutionContext, ToolDefinition } from "@cowork/core";
import { PermissionLevel, executeTool } from "@cowork/core";
import { HttpGuard } from "@cowork/security/network";
import type {
  HermesConfig,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./types.js";

/**
 * Canonical Hermes MCP server: exposes locoworker tools over stdio or SSE.
 *
 * Security model:
 *   - SSE requires a Bearer token and binds loopback by default;
 *   - tool calls go through PermissionGate with the caller's policy, so an
 *     MCP client cannot bypass the session's permission level or approvals;
 *   - the tool allowlist is matched case-insensitively against tool names and
 *     supports the short aliases documented in .env.example; when unset, only
 *     read-only tools are exposed (never the whole tool registry).
 */
/** Exposed when no allowlist is configured: read-only tools only. */
const SAFE_DEFAULT_TOOLS = ["Read", "Glob", "Grep", "WikiRead", "WikiSearch", "MemorySearch"];

const TOOL_ALIASES: Record<string, string> = {
  read: "Read", write: "Write", edit: "Edit", glob: "Glob", grep: "Grep",
  bash: "Bash", wiki_read: "WikiRead", wiki_search: "WikiSearch",
  memory_search: "MemorySearch", memory_save: "MemorySave",
};

function normalizeToolNames(allowlist: string[] | undefined): Set<string> {
  const names = new Set<string>();
  for (const name of SAFE_DEFAULT_TOOLS) names.add(name.toLowerCase());
  if (!allowlist || allowlist.length === 0) return names;
  for (const raw of allowlist) {
    const key = raw.trim();
    if (!key) continue;
    names.add(key.toLowerCase());
    if (TOOL_ALIASES[key.toLowerCase()]) names.add(TOOL_ALIASES[key.toLowerCase()]!.toLowerCase());
  }
  return names;
}

export class HermesServer {
  private tools: Map<string, ToolDefinition>;
  private config: HermesConfig;
  private running = false;
  private guard: HttpGuard | null = null;
  private stdioQueue: Promise<void> = Promise.resolve();

  constructor(config: HermesConfig, tools: ToolDefinition[]) {
    this.config = config;
    const allowlist = normalizeToolNames(config.toolAllowlist);
    const filtered = tools.filter((t) => allowlist.has(t.name.toLowerCase()));
    this.tools = new Map(filtered.map((t) => [t.name, t]));
  }

  /** Tool names actually exposed (useful for startup logs and tests). */
  exposedTools(): string[] {
    return [...this.tools.keys()];
  }

  async startStdio(): Promise<void> {
    if (this.running) return;
    this.running = true;
    process.stderr.write(`[hermes] MCP server started (stdio, ${this.tools.size} tools exposed)\n`);

    let buffer = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        // Serialise requests so JSON-RPC responses stay ordered.
        this.stdioQueue = this.stdioQueue.then(() => this.handleLine(line)).catch(() => {});
      }
    });

    await new Promise<void>((resolve) => {
      process.stdin.once("end", () => {
        this.running = false;
        resolve();
      });
    });
  }

  startSse(): void {
    if (!this.config.port) throw new Error("[hermes] SSE transport requires a port.");
    this.guard = new HttpGuard({
      serviceName: "Hermes MCP (SSE)",
      tokenEnvVar: this.config.tokenEnvVar ?? "COWORK_HERMES_AUTH_TOKEN",
      token: this.config.authToken,
      hostname: this.config.hostname,
    });
    this.guard.logStartup();
    const self = this;

    Bun.serve({
      ...this.guard.bindOptions,
      port: this.config.port,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        if (url.pathname === "/health") {
          return Response.json({ ok: true, tools: self.exposedTools().length });
        }
        const denied = self.guard!.authorize(req);
        if (denied) return denied;

        if (url.pathname === "/sse") return self.handleSse(req);
        if (req.method === "POST" && url.pathname === "/message") return self.handleHttpMessage(req);
        return Response.json({ error: "Not found" }, { status: 404 });
      },
    });
    process.stderr.write(
      `[hermes] MCP server started (SSE, port ${this.config.port}, ${this.tools.size} tools exposed)\n`,
    );
  }

  /** The guard is exposed so tests/clients can read the generated token. */
  get httpGuard(): HttpGuard | null {
    return this.guard;
  }

  private handleSse(_req: Request): Response {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue('data: {"type":"ready"}\n\n');
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

  private async handleLine(line: string): Promise<void> {
    try {
      const req = JSON.parse(line) as McpJsonRpcRequest;
      const response = await this.dispatch(req);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const errResponse: McpJsonRpcResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: `Parse error: ${err instanceof Error ? err.message : String(err)}` },
      };
      process.stdout.write(JSON.stringify(errResponse) + "\n");
    }
  }

  private async handleHttpMessage(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as McpJsonRpcRequest;
      return Response.json(await this.dispatch(body));
    } catch {
      return Response.json(
        { jsonrpc: "2.0", id: 0, error: { code: -32700, message: "Parse error" } },
        { status: 400 },
      );
    }
  }

  /** Exposed for tests; executes one JSON-RPC request. */
  async dispatch(req: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    const respond = (result: unknown): McpJsonRpcResponse => ({ jsonrpc: "2.0", id: req.id, result });
    const respondError = (code: number, message: string): McpJsonRpcResponse => ({
      jsonrpc: "2.0", id: req.id, error: { code, message },
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
        const params = req.params as { name: string; arguments?: unknown } | undefined;
        if (!params?.name) return respondError(-32602, "Missing tool name");
        const tool = this.tools.get(params.name);
        if (!tool) return respondError(-32602, `Unknown tool: ${params.name}`);

        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const execCtx: ExecutionContext = {
          workingDirectory: this.config.workingDirectory ?? process.cwd(),
          sessionId: "hermes",
          permissionLevel: this.config.permissionLevel ?? this.config.policy?.permissionLevel ?? PermissionLevel.READ_ONLY,
          settings: this.config.settings ?? this.config.policy?.settings,
          abortSignal: this.config.abortSignal ?? this.config.policy?.abortSignal,
        };

        // Single hardened choke point: schema validation, permission gate,
        // approval, then execution. No direct tool.execute here.
        const outcome = await executeTool(tool, args, execCtx, {
          approve: this.config.requestApproval ?? this.config.policy?.requestApproval,
        });
        return respond({
          content: [{ type: "text", text: outcome.result.content }],
          isError: outcome.result.isError,
        });
      }

      case "shutdown":
        return respond({});

      default:
        return respondError(-32601, `Method not found: ${req.method}`);
    }
  }
}

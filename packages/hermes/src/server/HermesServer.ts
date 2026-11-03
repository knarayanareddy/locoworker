import type { ExecutionContext, ToolDefinition } from "@cowork/core";
import { PermissionLevel, executeTool } from "@cowork/core";
import { HttpGuard } from "@cowork/security/network";
import {
  mergeResourceLimits,
  readBoundedText,
  isBodyTooLarge,
  type ResourceLimits,
} from "@cowork/security/utils";
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
 *     read-only tools are exposed (never the whole tool registry);
 *   - R-11: SSE connections, request bodies and stdio buffers are bounded.
 */
/** Exposed when no allowlist is configured: read-only tools only. */
const SAFE_DEFAULT_TOOLS = ["Read", "Glob", "Grep", "WikiRead", "WikiSearch", "MemorySearch"];

const TOOL_ALIASES: Record<string, string> = {
  read: "Read", write: "Write", edit: "Edit", glob: "Glob", grep: "Grep",
  bash: "Bash", wiki_read: "WikiRead", wiki_search: "WikiSearch",
  memory_search: "MemorySearch", memory_save: "MemorySave",
};

function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

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
  private readonly limits: ResourceLimits;
  private sseServer: ReturnType<typeof Bun.serve> | null = null;
  private activeSse = 0;

  constructor(config: HermesConfig, tools: ToolDefinition[]) {
    this.config = config;
    this.limits = mergeResourceLimits(config.limits);
    const allowlist = normalizeToolNames(config.toolAllowlist);
    const filtered = tools.filter((t) => allowlist.has(t.name.toLowerCase()));
    this.tools = new Map(filtered.map((t) => [t.name, t]));
  }

  /** Tool names actually exposed (useful for startup logs and tests). */
  exposedTools(): string[] {
    return [...this.tools.keys()];
  }

  /** Live SSE connection count (bounded by maxSseConnections). */
  get activeSseConnections(): number {
    return this.activeSse;
  }

  /** The port actually bound (useful when config.port is 0 for ephemeral ports). */
  get boundPort(): number {
    return this.sseServer?.port ?? this.config.port ?? 0;
  }

  async startStdio(): Promise<void> {
    if (this.running) return;
    this.running = true;
    process.stderr.write(`[hermes] MCP server started (stdio, ${this.tools.size} tools exposed)\n`);

    let buffer = "";
    let queued = 0;
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      // R-11: a client that never sends a newline cannot grow this buffer.
      if (buffer.length + chunk.length > this.limits.maxMcpLineBytes) {
        process.stderr.write("[hermes] stdio line exceeds byte cap; dropping buffered input\n");
        buffer = "";
        return;
      }
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        if (queued >= this.limits.maxMcpPending) {
          process.stderr.write("[hermes] too many queued stdio requests; dropping line\n");
          continue;
        }
        queued += 1;
        // Serialise requests so JSON-RPC responses stay ordered.
        this.stdioQueue = this.stdioQueue
          .then(() => this.handleLine(line))
          .catch(() => {})
          .finally(() => { queued = Math.max(0, queued - 1); });
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
    // port 0 is valid: it asks Bun for an ephemeral port (used by tests).
    if (this.config.port === undefined) {
      throw new Error("[hermes] SSE transport requires a port.");
    }
    this.guard = new HttpGuard({
      serviceName: "Hermes MCP (SSE)",
      tokenEnvVar: this.config.tokenEnvVar ?? "COWORK_HERMES_AUTH_TOKEN",
      token: this.config.authToken,
      hostname: this.config.hostname,
    });
    this.guard.logStartup();
    const self = this;

    this.sseServer = Bun.serve({
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
      `[hermes] MCP server started (SSE, port ${this.boundPort}, ${this.tools.size} tools exposed)\n`,
    );
  }

  /** Stop the SSE listener; also releases all connection slots. */
  stop(): void {
    this.sseServer?.stop();
    this.sseServer = null;
    this.activeSse = 0;
  }

  /** The guard is exposed so tests/clients can read the generated token. */
  get httpGuard(): HttpGuard | null {
    return this.guard;
  }

  /**
   * R-11: cap concurrent SSE connections and give each one an absolute
   * lifetime. Heartbeats keep the stream readable but do NOT extend the cap,
   * so idle or abandoned connections cannot pin a slot forever.
   */
  private handleSse(req: Request): Response {
    const limits = this.limits;
    if (this.activeSse >= limits.maxSseConnections) {
      return new Response(
        JSON.stringify({ error: "Too many SSE connections" }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "5",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    this.activeSse += 1;
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (idle) clearTimeout(idle);
      req.signal.removeEventListener("abort", cleanup);
      this.activeSse = Math.max(0, this.activeSse - 1);
      try { controller?.close(); } catch { /* already closed */ }
    };

    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(encoder.encode('data: {"type":"ready"}\n\n'));
        heartbeat = setInterval(() => {
          if (closed) return;
          try {
            c.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            cleanup();
          }
        }, limits.sseHeartbeatMs);
        idle = setTimeout(cleanup, limits.sseIdleMs);
        unrefTimer(heartbeat);
        unrefTimer(idle);
        req.signal.addEventListener("abort", cleanup, { once: true });
        if (req.signal.aborted) cleanup();
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
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

  private jsonRpcParseError(): Response {
    return Response.json(
      { jsonrpc: "2.0", id: 0, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  private async handleHttpMessage(req: Request): Promise<Response> {
    let raw: string;
    try {
      raw = await readBoundedText(req, this.limits.maxRequestBytes);
    } catch (err) {
      if (isBodyTooLarge(err)) {
        return Response.json({ error: "Message too long" }, { status: 413 });
      }
      return this.jsonRpcParseError();
    }
    try {
      const body = JSON.parse(raw) as McpJsonRpcRequest;
      if (!body || typeof body !== "object" || Array.isArray(body)) return this.jsonRpcParseError();
      return Response.json(await this.dispatch(body));
    } catch {
      return this.jsonRpcParseError();
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

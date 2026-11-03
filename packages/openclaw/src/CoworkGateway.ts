/**
 * High-level integration: wires the canonical GatewayServer to the cowork
 * agent loop. Messages are always authenticated by the gateway's Bearer token.
 *
 * R-11: per-sender chat history is kept in a bounded, expiring LRU map. The
 * old plain Map had one entry per `channel:sender` and never evicted, so a
 * client able to mint identities could grow memory without limit.
 */
import { queryLoop, QueryEngine, resolveProvider, DEFAULT_TOOLS, type ToolDefinition, type AgentPolicy } from "@cowork/core";
import { GatewayServer } from "./gateway/GatewayServer.js";
import type { InboundMessage, MessageHandler } from "./gateway/types.js";
import {
  BoundedMap,
  mergeResourceLimits,
  createEvictionLogger,
  type ResourceLimits,
  type BoundedMapStats,
} from "@cowork/security/utils";

export interface CoworkGatewayConfig {
  projectRoot: string;
  port: number;
  rateLimitPerMinute?: number;
  authToken?: string;
  webhookSecret?: string;
  allowedSenders?: string[];
  senderTokens?: Record<string, string>;
  agentSystemPrompt?: string;
  historyTurns?: number;
  /** Max distinct chat sessions retained in memory (default 1000). */
  maxSessions?: number;
  /** Absolute TTL of a chat session in ms (default 30 minutes). */
  sessionTtlMs?: number;
  /** Trusted operator-level resource limits; never read from a clone. */
  limits?: Partial<ResourceLimits>;
  /** Tools exposed to remote users. Defaults to read-only tools only. */
  tools?: ToolDefinition[];
  policy?: AgentPolicy;
}

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

type HistoryEntry = { role: "user" | "assistant"; content: string };

function estimateHistory(key: string, history: HistoryEntry[]): number {
  let bytes = key.length + 16;
  for (const message of history) bytes += (message.content?.length ?? 0) + 8;
  return bytes;
}

export class CoworkGateway {
  private server: GatewayServer;
  private config: CoworkGatewayConfig;
  private readonly limits: ResourceLimits;
  private readonly userSessions: BoundedMap<string, HistoryEntry[]>;
  private readonly tools: ToolDefinition[];

  constructor(config: CoworkGatewayConfig) {
    this.config = { historyTurns: 20, rateLimitPerMinute: 20, ...config };
    this.limits = mergeResourceLimits({
      ...config.limits,
      ...(config.maxSessions !== undefined ? { maxSessions: config.maxSessions } : {}),
      ...(config.sessionTtlMs !== undefined ? { sessionTtlMs: config.sessionTtlMs } : {}),
    });
    const logEviction = createEvictionLogger("gateway sessions");
    this.userSessions = new BoundedMap<string, HistoryEntry[]>({
      maxEntries: this.limits.maxSessions,
      maxBytes: this.limits.maxStateBytes,
      ttlMs: this.limits.sessionTtlMs,
      estimateSize: estimateHistory,
      onEvict: (_key, _value, reason) => logEviction(reason),
    });
    this.tools = config.tools ?? DEFAULT_TOOLS.filter((t) => READ_ONLY_TOOLS.includes(t.name));
    this.server = new GatewayServer({
      port: config.port,
      rateLimitPerMinute: this.config.rateLimitPerMinute!,
      authToken: config.authToken,
      webhookSecret: config.webhookSecret,
      allowedSenders: config.allowedSenders,
      senderTokens: config.senderTokens,
      limits: this.limits,
    });
  }

  async start(): Promise<void> {
    const handler: MessageHandler = (msg) => this.handleMessage(msg);
    this.server.onMessage(handler);
    this.server.start();
  }

  async stop(): Promise<void> {
    this.server.stop();
  }

  /** Live session bounds/eviction counters. */
  get resourceStats(): BoundedMapStats {
    return this.userSessions.stats();
  }

  private async handleMessage(msg: InboundMessage): Promise<string> {
    const sessionKey = `${msg.channel}:${msg.from}`;
    const history = this.userSessions.get(sessionKey) ?? [];
    history.push({ role: "user", content: msg.text });
    const maxMessages = (this.config.historyTurns ?? 20) * 2;
    if (history.length > maxMessages) history.splice(0, history.length - maxMessages);
    this.userSessions.set(sessionKey, history);

    try {
      const provider = resolveProvider({
        provider: this.config.policy?.settings?.provider,
        model: this.config.policy?.settings?.model,
        apiKey: this.config.policy?.settings?.apiKey,
        baseUrl: this.config.policy?.settings?.baseUrl,
        env: process.env,
      });
      const engine = new QueryEngine(provider);

      let response = "";
      for await (const event of queryLoop(msg.text, {
        engine,
        systemPrompt:
          this.config.agentSystemPrompt ??
          "You are a helpful AI assistant responding via a messaging gateway.",
        // queryLoop ignores userInput when history is supplied, so the current
        // user message MUST be included here (the old code dropped it).
        history: history.map((m) => ({ role: m.role, content: m.content })),
        tools: this.tools,
        policy: this.config.policy,
        workingDirectory: this.config.projectRoot,
      })) {
        if (event.type === "complete") response = event.text;
      }
      if (!response) response = "(No response)";
      history.push({ role: "assistant", content: response });
      // Re-set so the byte estimate reflects the appended assistant message.
      this.userSessions.set(sessionKey, history);
      return response;
    } catch (err) {
      return `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

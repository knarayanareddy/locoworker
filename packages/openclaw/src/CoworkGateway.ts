/**
 * High-level integration: wires the canonical GatewayServer to the cowork
 * agent loop. Messages are always authenticated by the gateway's Bearer token.
 */
import { queryLoop, QueryEngine, resolveProvider, DEFAULT_TOOLS, type ToolDefinition, type AgentPolicy } from "@cowork/core";
import { GatewayServer } from "./gateway/GatewayServer.js";
import type { InboundMessage, MessageHandler } from "./gateway/types.js";

export interface CoworkGatewayConfig {
  projectRoot: string;
  port: number;
  rateLimitPerMinute?: number;
  authToken?: string;
  webhookSecret?: string;
  allowedSenders?: string[];
  agentSystemPrompt?: string;
  historyTurns?: number;
  /** Tools exposed to remote users. Defaults to read-only tools only. */
  tools?: ToolDefinition[];
  policy?: AgentPolicy;
}

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

export class CoworkGateway {
  private server: GatewayServer;
  private config: CoworkGatewayConfig;
  private userSessions = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();
  private readonly tools: ToolDefinition[];

  constructor(config: CoworkGatewayConfig) {
    this.config = { historyTurns: 20, rateLimitPerMinute: 20, ...config };
    this.tools = config.tools ?? DEFAULT_TOOLS.filter((t) => READ_ONLY_TOOLS.includes(t.name));
    this.server = new GatewayServer({
      port: config.port,
      rateLimitPerMinute: this.config.rateLimitPerMinute!,
      authToken: config.authToken,
      webhookSecret: config.webhookSecret,
      allowedSenders: config.allowedSenders,
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
      return response;
    } catch (err) {
      return `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

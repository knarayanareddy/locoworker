/**
 * High-level integration: wires GatewayServer to the cowork agent loop.
 * Drop-in: create a CoworkGateway and call start() to begin accepting
 * messages from configured channels and routing them through cowork.
 */
import { GatewayServer } from "./GatewayServer";
import type { GatewayConfig, InboundMessage, CoworkGatewayConfig } from "./types";
import { MemorySystem, resolveSettings } from "@cowork/core";

export class CoworkGateway {
  private server: GatewayServer;
  private config: CoworkGatewayConfig;
  private userSessions = new Map<
    string,
    Array<{ role: "user" | "assistant"; content: string }>
  >();

  constructor(config: CoworkGatewayConfig) {
    this.config = { historyTurns: 20, ...config };
    this.server = new GatewayServer(config);
  }

  async start(): Promise<void> {
    this.server.onMessage(async (msg, reply) => {
      await this.handleMessage(msg, reply);
    });
    await this.server.start();
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  private async handleMessage(
    msg: InboundMessage,
    reply: (text: string) => Promise<void>
  ): Promise<void> {
    // ── typing indicator (best effort) ────────────────────────────────────
    const sessionKey = `${msg.channelType}:${msg.channelId}:${msg.userId}`;
    const history = this.userSessions.get(sessionKey) ?? [];

    // Append user turn
    history.push({ role: "user", content: msg.text });
    if (history.length > (this.config.historyTurns ?? 20) * 2) {
      history.splice(0, 2);
    }
    this.userSessions.set(sessionKey, history);

    try {
      // Dynamically import queryLoop to avoid circular deps at startup
      const { queryLoop } = await import("@cowork/core");
      const settings = await resolveSettings(
        this.config.projectRoot,
        process.env,
        {}
      );

      const { QueryEngine, resolveProvider } = await import("@cowork/core");
      const provider = resolveProvider({
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        env: process.env as any,
      });
      const engine = new QueryEngine(provider);

      // Collect final text from the agent loop
      let response = "";
      for await (const event of queryLoop(msg.text, {
        engine,
        settings,
        systemPrompt:
          this.config.agentSystemPrompt ??
          "You are a helpful AI assistant responding via a messaging gateway.",
        history: history.slice(0, -1), // exclude the turn we just added
        tools: [],
        workingDirectory: this.config.projectRoot,
      })) {
        if (event.type === "text") response += event.text;
      }

      if (!response) response = "(No response)";

      // Append assistant turn
      history.push({ role: "assistant", content: response });
      this.userSessions.set(sessionKey, history);

      await reply(response);
    } catch (err) {
      await reply(
        `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

import { GatewayServer } from "./GatewayServer";
import type { GatewayConfig, InboundMessage } from "./types";
import { OrchestratorEngine, MemorySystem, resolveSettings } from "@cowork/core";

export class CoworkGateway {
  private server: GatewayServer;
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.server = new GatewayServer(config);
  }

  async start(): Promise<void> {
    this.server.on("message", (msg) => void this.handleInbound(msg));
    await this.server.start();
  }

  private async handleInbound(msg: InboundMessage): Promise<void> {
    console.error(`[OpenClaw] Inbound from ${msg.senderName} (${msg.channelType}): ${msg.text}`);

    const settings = await resolveSettings(this.config.projectRoot, process.env, {});
    const orchestrator = new OrchestratorEngine({
      projectRoot: this.config.projectRoot,
      settings,
    });

    try {
      const response = await orchestrator.execute(msg.text);
      await this.server.send(msg.channelId, msg.senderId, {
        text: response,
      });
    } catch (err) {
      await this.server.send(msg.channelId, msg.senderId, {
        text: `Sorry, I encountered an error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

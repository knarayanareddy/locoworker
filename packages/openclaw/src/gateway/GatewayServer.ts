import { randomUUID } from "node:crypto";
import { RateLimiter } from "./RateLimiter.js";
import { scrubSecrets } from "@cowork/security";
import type {
  GatewayConfig,
  InboundMessage,
  OutboundMessage,
  MessageHandler,
} from "./types.js";

export class GatewayServer {
  private rateLimiter: RateLimiter;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private handler: MessageHandler | null = null;
  private outbox: OutboundMessage[] = [];

  constructor(private config: GatewayConfig) {
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  start(): void {
    const self = this;

    this.server = Bun.serve({
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

        if (req.method === "POST" && url.pathname === "/message") {
          return self.handleMessageRequest(req);
        }

        if (req.method === "GET" && url.pathname === "/health") {
          return new Response(
            JSON.stringify({ status: "ok", port: self.config.port }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (req.method === "GET" && url.pathname === "/outbox") {
          return new Response(JSON.stringify(self.outbox.slice(-50)), {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    process.stderr.write(
      `[openclaw] Gateway server listening on port ${this.config.port}\n`
    );
  }

  stop(): void {
    this.server?.stop();
    this.server = null;
  }

  private async handleMessageRequest(req: Request): Promise<Response> {
    let body: { from?: string; text?: string; metadata?: Record<string, unknown> };

    try {
      body = (await req.json()) as typeof body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const from = body.from ?? "anonymous";
    const text = body.text ?? "";

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "Empty message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!this.rateLimiter.isAllowed(from)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    if (
      this.config.allowedSenders &&
      this.config.allowedSenders.length > 0 &&
      !this.config.allowedSenders.includes(from)
    ) {
      return new Response(JSON.stringify({ error: "Sender not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const inbound: InboundMessage = {
      id: randomUUID(),
      channel: "http",
      from,
      text: scrubSecrets(text),
      timestamp: new Date().toISOString(),
      metadata: body.metadata,
    };

    const outbound: OutboundMessage = {
      id: randomUUID(),
      inboundId: inbound.id,
      channel: "http",
      to: from,
      text: "",
      status: "processing",
      timestamp: new Date().toISOString(),
    };

    this.outbox.push(outbound);

    try {
      const responseText = this.handler
        ? await this.handler(inbound)
        : "No handler registered.";

      outbound.text = responseText;
      outbound.status = "complete";

      return new Response(
        JSON.stringify({ id: outbound.id, response: responseText }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      outbound.status = "error";
      outbound.text = err instanceof Error ? err.message : String(err);

      return new Response(
        JSON.stringify({ error: "Handler failed", id: outbound.id }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }
}

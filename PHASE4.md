# Phase 4 — Feature Guide

Phase 4 adds a swarm simulation studio (MiroFish), a messaging gateway (OpenClaw),
an MCP server host (Hermes), telemetry + cost analytics, advanced security,
prompt cache engineering, council debates, SOUL.md personas, and a web dashboard.

## New packages

| Package | Description |
|---------|-------------|
| `@cowork/mirofish` | Swarm-intelligence multi-agent simulation — spawn agents with personalities, simulate social dynamics, generate prediction reports |
| `@cowork/openclaw` | Messaging gateway — connect Telegram, Slack, Discord, webhooks to the agent loop |
| `@cowork/hermes` | MCP server host — expose cowork tools as an MCP server for Claude Desktop and other agents |
| `@cowork/telemetry` | Structured observability — spans, traces, metrics, optional OTLP export |
| `@cowork/analytics` | Cost tracking — per-session + daily + monthly token usage and USD estimates |
| `@cowork/security` | Advanced security — audit log, enhanced sandbox policy with entropy detection |
| `@cowork/cache` | Prompt cache engineering — stable layered system prompts, Anthropic cache breakpoints |

## New core modules

| Module | Description |
|--------|-------------|
| `core/council` | CouncilDebate — structured multi-agent debates with verdict and confidence |
| `core/soul` | SOUL.md persona context — identity file injected at prompt layer 0 |

## New apps

| App | Description |
|-----|-------------|
| `apps/dashboard` | Web dashboard (port 3720) — memory browser, wiki, audit log, analytics |

## New tools

| Tool | Description |
|------|-------------|
| `SimulationRun` | Run a MiroFish swarm simulation |
| `UsageReport` | Daily / monthly token usage and cost report |
| `AuditQuery` | Query the session audit log |
| `CouncilRun` | Multi-agent council debate |

## New slash commands

| Command | Description |
|---------|-------------|
| `/simulate <scenario>` | Run a quick MiroFish simulation |
| `/council <question>` | Run a council debate |
| `/cost [date|month]` | Show usage + cost |
| `/audit [risk level]` | View audit log |
| `/hermes start` | Show Hermes MCP server setup |
| `/dashboard` | Launch the web dashboard (detached) |
| `/gateway` | Show OpenClaw gateway setup |
| `/soul` | View or create SOUL.md |

## MiroFish quick start

```bash
# In the REPL
cowork> /simulate "Company announces 30% price increase for its SaaS product"

# Or via the agent tool
cowork> Run a MiroFish simulation on: "Open-source project switches to BSL license"
```

## OpenClaw Telegram setup

```typescript
import { CoworkGateway } from '@cowork/openclaw'

const gateway = new CoworkGateway({
  projectRoot: process.cwd(),
  channels: [{ type: 'telegram', channelId: 'default' }],
  httpPort: 3721,
  rateLimitPerUser: 20,
})
await gateway.start()
```

## Hermes MCP server (Claude Desktop integration)

```bash
# Start Hermes
bun run packages/hermes/src/bin.ts --transport stdio

# Add to claude_desktop_config.json:
{
  "mcpServers": {
    "cowork": {
      "command": "bun",
      "args": ["run", "/path/to/locoworker/packages/hermes/src/bin.ts"]
    }
  }
}
```

## Dashboard

```bash
bun run dashboard
# Opens at http://localhost:3720
```

Phase 7 adds the "Multi-Agent & Gateway" layer to locoworker.

### New packages
| Package                 | Description                                                        |
|-------------------------|--------------------------------------------------------------------|
| `@cowork/orchestrator`  | Coordinator/worker pool, task queue, council debate pattern        |
| `@cowork/research`      | AutoResearch loop: plan → execute → synthesize → report            |
| `@cowork/mirofish`      | Multi-agent simulation studio with configurable agents and rounds  |
| `@cowork/openclaw`      | HTTP gateway + Telegram bot for external message routing to agent  |
| `@cowork/hermes`        | MCP server host — exposes locoworker tools to external MCP clients |

### New apps
| App                     | Description                                                        |
|-------------------------|--------------------------------------------------------------------|
| `apps/kairos-daemon`    | Standalone Bun process for the Kairos scheduler with Unix IPC      |

### Core additions
- `ReActPlanner` — Reason + Act planning loop for structured multi-step execution
- `BeamPlanner` — Beam search plan generator (multiple candidates, score-ranked)
- `AnthropicStreamingProvider` — Real streaming implementation for Anthropic
- `OpenAIStreamingProvider` — Real streaming implementation for OpenAI-compatible endpoints
- `@cowork/core/planning` export subpath

### CLI additions
- New slash commands: `/research`, `/council`, `/simulate`, `/kairos`, `/hermes`
- `SessionRuntime` now instantiates and exposes coordinator, council, research, simulation, gateway, and hermes
- Tools added to agent: `orchestrate`, `council_debate`, `research`, `research_plan`, `simulate`

### Updated wiring
- Root `tsconfig.json` references 14 workspace packages + 2 apps
- `tsconfig.base.json` paths covers all 12 packages
- `apps/cowork-cli/tsconfig.json` references all 12 packages
- `.env.example` documents all Phase 7 env vars
- `KairosClient` added to `@cowork/kairos` for IPC communication with the daemon

### Coming in Phase 8
- `@cowork/plugins` — real plugin marketplace + plugin sandboxing
- Full SSE bidirectional transport in Hermes (message queuing, reconnection)
- `council_debate` tool exposed as a direct agent tool (currently slash-command only)
- Network sandbox enforcement (intercept fetch, not just advisory)
- Voice interface integration
- Eval harness test suite (`.cowork/evals/*.json` loader + CI runner)
- Full OTLP SDK replacement (replace fetch-based flush)
- Desktop app wrapper (Electron/Tauri)

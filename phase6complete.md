# Phase 6 Complete — Product & Observability

Phase 6 has successfully added the "Product & Observability" layer to locoworker.

### New packages
| Package              | Description                                              |
|----------------------|----------------------------------------------------------|
| `@cowork/telemetry`  | OpenTelemetry-compatible tracing + per-model cost tracker|
| `@cowork/analytics`  | Per-session + aggregate usage analytics                  |
| `@cowork/security`   | Secret scrubbing, audit log, network sandbox             |
| `@cowork/kairos`     | Background task scheduler + file watcher daemon          |
| `@cowork/wiki`       | LLMWiki: compounding knowledge store with AI compilation |

### Core additions
- `FullCompact` — third compression tier (structured: summary + decisions + facts + questions)
- `StreamingProvider` / `assembleFromStream` — streaming abstraction layer for providers
- `EvalRunner` / `EvalCase` — eval harness for testing agent behavior against expected outputs

### CLI additions
- REPL v2: persistent history file, rich prompt with model+mode, inline approval prompts
- New slash commands: `/sessions`, `/skills`, `/telemetry`, `/audit`, `/analytics`
- Wiki tools available to the agent: `wiki_read`, `wiki_write`, `wiki_compile`, `wiki_list`, `wiki_search`

### Updated wiring
- `SessionRuntime` now instantiates and wires all Phase 6 subsystems
- `on-complete` hook now records cost, analytics, audit, and flushes telemetry
- Root `tsconfig.json` references all 10 workspace packages
- `tsconfig.base.json` paths covers all current + planned packages

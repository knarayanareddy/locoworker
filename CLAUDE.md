# locoworker — Project Intelligence

> Auto-loaded into the agent system prompt. Keep it short and accurate.

## What this is

A Bun + TypeScript monorepo for a BYOK agentic coding workspace. The canonical
agent loop is `packages/core/src/queryLoop.ts`; tools live in
`packages/core/src/tools/`. Security primitives live in `packages/security/`.

Implemented: multi-provider routing, filesystem tools with path containment,
permission/approval gates, shared nested-agent policy, persistent memory and
transcripts, regex-based Graphify knowledge graph, wiki, Kairos scheduler,
Hermes MCP, OpenClaw HTTP/Telegram gateway, token-protected local dashboard,
eval harness, tests + CI.

Experimental or stubbed: Electron desktop, React/Vite dashboard panels (some
fixture data), `packages/plugins`, voice integrations, marketplace. Not present:
tree-sitter parsing, Tauri, Discord channel, TOTP-based gateway auth.

## Tech stack

- Runtime: Bun (≥1.1); language: TypeScript ESM (`.js` extension in imports).
- Storage: filesystem JSON / NDJSON under `COWORK_HOME` (default `~/.cowork`).
- CLI: `apps/cowork-cli`; dashboard: `apps/dashboard` (built-in UI).

## Commands

```bash
bun install --ignore-scripts
bun run typecheck     # tsc -b + frontend + desktop
bun test              # 60 unit/integration tests
bun run cowork        # REPL
bun run build:graph   # regenerate graphify-out/graph.json + GRAPH_REPORT.md
bun run dashboard     # http://127.0.0.1:3720 (token printed to stderr)
bun run eval          # built-in eval suites
```

## Conventions

- Use `node:fs/promises` and `node:path`; keep imports ESM-correct with `.js`.
- Tool definitions declare a `PermissionLevel`; anything powerful sets
  `requiresApproval: true`. Never auto-approve in a nested agent.
- Resolve model-supplied paths with `guardPath()` from `@cowork/core`.
- Use `filterEnv()` before spawning children; `scrubSecrets()` before logging.
- All HTTP surfaces use `HttpGuard` (loopback + Bearer + Origin checks).
- Project-local `.cowork/settings.json` is untrusted: it cannot set credentials,
  endpoints, MCP servers, permission modes, or sandbox settings.
- Run `bun run typecheck && bun test` before proposing a change.

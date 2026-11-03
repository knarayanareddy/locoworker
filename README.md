# locoworker

A Bun + TypeScript monorepo for a **BYOK, local-LLM agentic coding workspace**:
an agent loop with file/shell tools, persistent memory, a code knowledge graph,
MCP and messaging gateways, multi-agent orchestration, and a local dashboard.

> **Status:** this is an actively developed research codebase, not a finished
> product. Earlier versions of this README claimed "100% realized" features,
> tree-sitter parsing, a 71× token reduction, isolated containers by default,
> and working TOTP-protected Discord/Telegram gateways. Those claims were not
> accurate. The matrix below describes what actually exists today.

## Feature status

| Area | Status | Notes |
|------|--------|-------|
| Agent loop, tools, compression | ✅ working | `packages/core/src/queryLoop.ts`; 6 permission levels; approvals required for Bash and writes at elevated levels |
| BYOK providers | ✅ working | Anthropic, OpenAI, Ollama, LM Studio, DeepSeek, OpenRouter (`packages/core/src/providers`) |
| Persistent memory + transcripts | ✅ working | `~/.cowork/projects/<name>/`; `--resume` restores chat history |
| Graphify knowledge graph | ✅ working | **Regex/heuristic extractors**, not tree-sitter; `bun run build:graph` writes `graphify-out/graph.json` |
| Wiki, AutoDream, Kairos scheduler | ✅ working | Filesystem-backed; daemon is opt-in via `COWORK_KAIROS_ENABLED` |
| Hermes MCP server | ✅ working | stdio + SSE; Bearer token, loopback bind, tool allowlist, permission gate |
| OpenClaw gateway | ✅ working | HTTP + Telegram polling; Bearer token + HMAC webhooks. **Discord is not implemented** |
| Dashboard (built-in UI) | ✅ working | `apps/dashboard`, token-protected, real memory/audit/wiki/session data |
| Dashboard (React/Vite UI) | ⚠️ experimental | `apps/dashboard-frontend`; some panels still use fixture data; proxies `/api` to the local dashboard |
| Orchestrator, council, research, simulation | ✅ working | Nested agents inherit the caller's permission policy |
| Eval harness | ✅ working | `bun run eval` uses built-in suites; `bun run eval:custom` needs `.cowork/evals/*.eval.json` |
| Tests & CI | ✅ working | `bun test` (60 tests) and `.github/workflows/ci.yml` |
| Container isolation | ⚠️ opt-in | `COWORK_SANDBOX_MODE=docker|podman` requires a local container runtime; default is unsandboxed |
| Network sandbox | ✅ working | Allowlist + private-address blocking for `HttpFetch`; child processes never receive credentials |
| Electron desktop / plugins / voice / marketplace | ⚠️ experimental or stubs | `packages/plugins` is a typed stub; voice needs external API keys |
| tree-sitter AST parsing, Tauri shell, TOTP gateway auth | ❌ not present | TOTP exists only as an RFC 6238 utility; gateways use Bearer tokens + HMAC |

## Requirements

- **Bun ≥ 1.1** (CI uses Bun 1.1); `ripgrep` recommended for the `Grep` tool.
- An API key for your chosen provider, or a local Ollama/LM Studio endpoint.
- Optional: Docker or Podman for `COWORK_SANDBOX_MODE`.

## Quickstart

```bash
bun install --ignore-scripts       # --ignore-scripts skips Electron's binary download
cp .env.example .env               # fill in one provider key
bun run typecheck                  # tsc -b + frontend + desktop
bun test                           # unit/integration tests
bun run cowork                     # interactive REPL
bun run cowork "explain src/queryLoop.ts"
bun run cowork --resume <session-id> "continue"
bun run cowork --help
```

Other useful commands:

```bash
bun run build:graph        # regenerate the knowledge graph + report
bun run dashboard          # local dashboard at http://127.0.0.1:3720
bun run hermes:stdio       # Hermes MCP server over stdio
bun run eval               # built-in eval suites (requires a configured provider)
bun run kairos             # standalone Kairos daemon
```

## Security model

- **HTTP surfaces** (`apps/dashboard`, `packages/hermes`, `packages/openclaw`)
  bind to `127.0.0.1` by default and require a Bearer token. An ephemeral token
  is generated and printed to stderr for local use. Non-loopback binds require
  an explicit token of at least 16 characters (`COWORK_BIND_HOST`).
- State-changing requests are rejected when `Origin` / `Sec-Fetch-Site`
  indicate a cross-site request. Webhook ingress requires
  `X-Cowork-Signature: sha256=<hmac>` over the raw body.
- **Tool calls** pass through `PermissionGate`. Bash and other approval-flagged
  tools always ask; non-interactive sessions deny approvals unless `--yes`.
  A shared `AgentPolicy` propagates permissions, approvals, settings, hooks,
  cwd and abort signals into nested agents and MCP/gateway calls.
- **Paths** are confined to the project root, including symlink resolution.
- **Child processes** receive a filtered environment (`filterEnv`), and tool
  output/audit logs are scrubbed of credential patterns.
- **Project config is untrusted**: `<project>/.cowork/settings.json` cannot set
  API keys, base URLs, MCP servers, permission modes, or sandbox settings. Put
  those in `~/.cowork/settings.json` or environment variables.
- `JsEval` is permanently disabled; `HttpFetch` is allowlist-gated; `GitCommit`
  requires explicit file paths and approval.

See `.env.example` for the complete, current list of environment variables and
`CONTRIBUTING.md` for the development and security checklist.

## Repository map

```
apps/
  cowork-cli/          CLI REPL + one-shot entry point
  dashboard/           token-protected local HTTP dashboard (built-in UI)
  dashboard-frontend/  experimental React/Vite dashboard
  desktop/             experimental Electron shell
  kairos-daemon/       standalone background daemon
packages/
  core/                agent loop, tools, providers, memory, permissions, policy
  security/            HttpGuard, TOTP, scrubbing, env filtering, network sandbox, audit
  graphify/            knowledge-graph builder, extractors, storage, query
  hermes/              MCP server (canonical implementation)
  openclaw/            HTTP + Telegram gateway
  kairos/ wiki/ telemetry/ analytics/ orchestrator/ research/ mirofish/
  eval/ cache/ memory-v2/ voice/ templates/ marketplace/ projects/
  react-agent/ plugins/   experimental / stubs
scripts/build-graph.ts    graph build entry point
.github/workflows/ci.yml  install → typecheck → tests → graph → CLI smoke
```

## License

MIT — see [LICENSE](LICENSE).

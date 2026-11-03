# Contributing

Thanks for helping improve locoworker. This is a research codebase; small,
verifiable changes are preferred over large feature dumps.

## Setup

```bash
bun install --ignore-scripts   # skips Electron's binary download
cp .env.example .env
bun run typecheck
bun test
```

`bun --version` should be ≥ 1.2; CI pins **1.4.4**. `bun.lock` is the text
lockfile introduced in Bun 1.2, so 1.1.x cannot install this repository.
TypeScript 5.9 is used at the root (the frontend config relies on features from
that release).

## Before opening a change

1. `bun run typecheck` — typechecks all workspaces via `tsc -b`, plus the
   Vite frontend and Electron desktop configs.
2. `bun test` — unit/integration tests. Add tests for behaviour changes.
3. `bun run build:graph` — verifies the Graphify builder end-to-end.
4. `bun run cowork --help` — CLI entry point still boots.
5. Keep `graphify-out/`, `dist/`, `node_modules/`, `.cowork/` and generated
   `GRAPH_REPORT.md` out of the diff; they are gitignored.
6. Security-sensitive changes must add a regression test (see
   `packages/core/test/redteam-regressions.test.ts`,
   `packages/security/test/hardening.test.ts`,
   `packages/openclaw/test/gateway.test.ts`) and update
   `SECURITY_REVIEW.md`.

CI (`.github/workflows/ci.yml`) runs the same steps with
`bun install --frozen-lockfile --ignore-scripts`.

## Code conventions

- ESM only: relative imports end in `.js`, even for `.ts` sources.
- Use `node:fs/promises`, `node:path`, `node:crypto` rather than Bun-specific
  APIs where a portable alternative exists.
- Add new workspaces with a `tsconfig.json` extending `tsconfig.base.json` and
  add them to the root `tsconfig.json` references (or to the explicit
  frontend/desktop typechecks).

## Security checklist

Anything that crosses a trust boundary must:

- **HTTP**: use `HttpGuard` (loopback bind, Bearer token, Origin check) and
  HMAC-verify webhook bodies with `verifyWebhookSignature`.
- **Tool calls**: go through `PermissionGate`; declare a `PermissionLevel` and
  `requiresApproval` for powerful tools. Propagate `AgentPolicy` into nested
  loops; never hard-code `requestApproval: async () => true`.
- **Paths**: use `guardPath(root, input.path)` so `../` and symlinks cannot
  escape the project root.
- **Child processes**: pass `filterEnv(process.env)`; never interpolate
  user input into a shell string.
- **Logs and telemetry**: use `scrubSecrets` / `safeMetadata`; never log a
  token or API key.
- **Settings**: project-local config is untrusted. Sensitive keys belong in
  `PROJECT_UNTRUSTED_KEYS` and remote settings writes must go through
  `validateSettingsPatch`.

Report security issues privately rather than opening a public issue with a
working exploit.

## License

By contributing you agree that your contributions are licensed under the MIT
License (see `LICENSE`).

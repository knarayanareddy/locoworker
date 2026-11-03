# Release status / decision record

**Verified:** 2026-11-03 · **Branch:** `arena/d76b55f1-locoworker` · **Baseline:** `main` @ `7169e36`
**Plan:** [`PRODUCTION_READINESS_PLAN.md`](../PRODUCTION_READINESS_PLAN.md)
**Security status:** [`SECURITY_REVIEW.md`](../SECURITY_REVIEW.md)

> This is the go/no-go sheet. Update it at the end of every phase; do not let
> volatile CI numbers (test counts, graph sizes) live in narrative docs.

---

## 1. Locked decisions (D1–D6)

Locked 2026-11-03 at the user's direction. These are **decisions**, not claims
that the corresponding code has shipped — the implementing phase is named.

| ID | Decision | Locked default | Implemented in |
|----|----------|----------------|----------------|
| D1 | Target posture | **Local-first, single-user** CLI + loopback gateway/dashboard/desktop; trusted-LAN non-loopback only when explicitly enabled. Internet-facing multi-tenant is out of scope. | Phase G (docs), all phases (bounds) |
| D2 | Legacy raw-body webhook HMAC | **Strict by default**; legacy accepted only on loopback with a deprecation warning and sunset date. Breaking change for existing senders. | Phase C |
| D3 | `--yes` | Keep the flag but **scope it**: never auto-approve `DANGEROUS`/approval-flagged Bash-class tools, require `COWORK_ALLOW_AUTO_APPROVE=1`, loud stderr warning. | Phase C |
| D4 | Bash sandbox default | Keep `none` for interactive local use, but **deny unsandboxed Bash for non-interactive/gateway/desktop** unless `COWORK_ALLOW_UNSANDBOXED_BASH=1`; ship a digest-pinned container image. | Phase C |
| D5 | Release strategy | **One branch (`arena/d76b55f1-locoworker`), phased commits, one PR**; no other branch may be created, switched to or pushed. | all phases |
| D6 | Live-provider eval | **Not a release gate.** CI runs an offline mock-engine eval; real-provider eval stays a manual/scheduled workflow with secrets and is labelled unverified. | Phase E |

---

## 2. Gate status

| Gate | Status | Evidence |
|------|--------|----------|
| G1 — no open P1 in `SECURITY_REVIEW.md` §4 | 🟨 | **R-11 (Phase A) and R-13 / R-16 (Phase B) closed**; one by-design row remains (`~/.cowork/settings.json` is trusted) |
| G2 — negative test per new control | ✅ Phase A + B | 175 pass / 0 fail / 712 assertions / 25 files (was 107 / 452 / 16 at baseline) |
| G3 — CI verifies what it ships | ⬜ | still a single `verify` job; Phase E |
| G4 — Electron 45 launched/packaged | ⬜ | Phase E (packaging defects already identified) |
| G5 — scheduled OSV scan of SBOM | ⬜ | Phase F |
| G6 — actions pinned to SHAs | ⬜ | Phase E/F (SHAs resolved in plan §7/E1) |
| G7 — reproducible, reversible release | ⬜ | Phase G |
| G8 — docs match code | 🟨 | Phase A drift fixes done; `docs/STATUS.md` created; full pass is Phase H |
| G9 — accepted-risk register signed off | 🟨 | register in plan §13, owner column still open |

---

## 3. Phase A — R-11 resource limits — ✅ complete

**Controls**

- `packages/security/src/utils/resourceLimits.ts` — 18 trusted, clamped,
  env-backed limits; out-of-range values fall back to safe defaults.
- `BoundedMap.ts` — LRU-on-read, entry/byte/TTL caps, eviction counters,
  oversized-value refusal, rate-limited eviction logging.
- `tailFile.ts` — `O_NOFOLLOW` reverse-tail reads under a hard byte budget;
  `scanNdjsonTail` and `readNdjsonFileTail` helpers.
- `boundedBody.ts` — streaming body cap enforced **before** JSON parsing (also
  honouring `Content-Length`).
- `auditExport.ts` — caps both rows and serialised bytes, keeps newest events.
- `AuditLog.ts` — Ajv-validated bounded tail reads; `read(0)` hard-capped;
  `countRecent()` for dashboard stats without materialising events.
- `CoworkGateway.ts` / `GatewayServer.ts` — bounded session/outbox maps, 413 on
  oversized bodies, HMAC still verified over the exact bounded raw body.
- `HermesServer.ts` — `/sse` connection cap (503 + `Retry-After`), absolute
  connection lifetime, heartbeat, abort/`cancel` cleanup, bounded `/message`
  bodies, bounded stdio buffer and queued-line cap; `stop()` / `boundPort`.
- `McpStdioClient.ts` — stdout line cap, pending-request cap, per-request
  timeout with timer cleanup, exit cleanup, `stats()` for tests.
- `DashboardRouter.ts` — bounded `/api/audit`, `countRecent` status stat,
  capped `export-logs`, bounded NDJSON feeds, bounded settings POST body.

**Regression suites (all negative tests, 26 new tests)**

`packages/security/test/bounded-map.test.ts`,
`packages/security/test/audit-tail.test.ts`,
`packages/hermes/test/sse-limits.test.ts`,
`packages/core/test/mcp-timeouts.test.ts`,
`packages/openclaw/test/limits.test.ts`.

**Load smoke results**

| Scenario | Result |
|----------|--------|
| 10 000 distinct sender keys | map stays at 1 000 entries, 9 000 evictions, byte ceiling held |
| 3 SSE connects against a cap of 2 | `[200, 200, 503]`, `Retry-After: 5`, slots released after idle lifetime |
| 8 MiB audit log with a 128 KiB scan budget | `bytesRead ≤ 131 072`, newest 10 rows returned, `truncated: true` |
| Oversized HTTP bodies (gateway, Hermes, dashboard) | `413` before the handler/parsing runs |
| 500-row export against a 2 KiB byte cap | body ≤ 2 KiB, newest rows kept, `truncated: true` |

**Local verification:** `bun run typecheck` 0 errors · `bun test` 133/0/568/21 ·
`git diff --check` clean. CI verification is recorded in the PR, not here.

---

## 4. Phase B — R-13 supply chain — ✅ complete

**Controls**

- `security/src/utils/supplyChainPolicy.ts` — five trusted, string-valued
  policy knobs; **deny by default** (no MCP server, no plugin install, no
  `postInstall`).
- `security/src/utils/allowedCommand.ts` — resolves a config-supplied binary
  through the operator's PATH to an absolute real path, refuses shell strings
  and shell `-c`/`-e` argv, and requires an exact allowlist match.
- `core/src/mcp/mcpEnv.ts` — child env starts from `filterEnv`; credentials,
  execution hooks (`NODE_OPTIONS`, `LD_PRELOAD`, `BUN_OPTIONS`) and `PATH` from
  an untrusted MCP config are dropped and reported on stderr.
- `McpStdioClient.ts` — `shell: false`, allowlisted resolved executable,
  trusted `cwd`, filtered env (no `{ ...process.env, ...config.env }`).
- `buildMcpTools.ts` — per-server consent (`COWORK_MCP_ALLOW_SERVERS` or an
  interactive `approveServer` hook), safe server-name validation, tool caps,
  duplicate-name detection, warnings that list the skipped command + args.
- `mcpToolMetadata.ts` — descriptions framed in explicit untrusted-data
  delimiters, capped, stripped of control/bidi characters and injected
  delimiters; Ajv-validated, `$ref`/prototype-free input schemas; discovered
  tools are `requiresApproval: true` and name-prefixed.
- `marketplace/src/pluginSignature.ts` + `MarketplaceClient.ts` — detached
  Ed25519 signature over a canonical payload plus a `sha512` integrity hash,
  verified **before any directory or file is written**; trusted keys come only
  from the caller, `COWORK_PLUGIN_TRUSTED_KEY` or `~/.cowork/plugin-keys.json`
  (never the registry index). Bundles/manifests use `O_NOFOLLOW` `0600`
  writers; entrypoints are confined by `guardPath`.
- `plugins/src/PluginManager.ts` — re-verifies signature and integrity at load
  time, so an on-disk edit after install is rejected. Signature verification is
  **not** a sandbox; plugin execution remains deferred.
- `templates/src/scaffoldPath.ts` + `Scaffolder.ts` — rejects absolute paths,
  `../` escapes, symlinks in the writable chain and sensitive filenames while
  still allowing `.cowork/settings.json` / `.gitignore`; `O_NOFOLLOW` writes;
  file-count / per-file / total-byte caps; `postInstall` is opt-in, argv-only,
  allowlisted, timed out, output-capped and env-filtered.

**Regression suites (all negative tests, 42 new tests)**

`packages/core/test/mcp-hardening.test.ts`,
`packages/marketplace/test/install-signature.test.ts`,
`packages/plugins/test/plugin-manager.test.ts`,
`packages/templates/test/scaffolder.test.ts`, plus the MCP guard case added to
`packages/core/test/tool-manifest.test.ts`. The spawn-env source guard allows
one documented trusted first-party exception (`apps/desktop/src/main.ts`).

**Negative-test results**

| Attack shape | Result |
|--------------|--------|
| MCP config sets `NODE_OPTIONS` / `LD_PRELOAD` / `OPENAI_API_KEY` / `PATH` | keys dropped, child env clean, rejected keys logged |
| Unconsented MCP server / empty executable allowlist | zero spawns, zero registered tools |
| `sh -c` argv and shell metacharacters in a command | refused before resolution |
| MCP description with instruction override + bidi control + injected delimiter | framed as untrusted data, stripped, capped |
| MCP `inputSchema` with `$ref` / `constructor` / depth 30 / bad types | rejected |
| Unsigned / wrong-key / tampered / swapped-version / mismatched-integrity plugin | fail closed, nothing written |
| Registry-provided `keyId` used as a trust anchor | ignored (no trusted key → install fails) |
| `../` entrypoint and pre-planted symlink entrypoint | refused; victim file unchanged |
| Template `../`, absolute path, symlink, `.env` / `id_rsa` / `server.key` | refused; no file outside the target |
| `postInstall` by default, or with an empty allowlist | skipped, no process spawned |
| Allowlisted `postInstall` child process | runs with no credentials in its env |
| Template with too many / oversized files | rejected before any write |

**Local verification:** `bun run typecheck` 0 errors · `bun test` 175/0/712/25 ·
`git diff --check` clean. CI verification is recorded in the PR, not here.

---

## 5. Next

Phase C (strict HMAC / `--yes` scoping / Bash sandbox defaults) is next.
Then D → E → F → G → H.

**Deferred, tracked, not forgotten:** TypeScript 7, Vite 8 / plugin-react 6,
provider SDK majors, frontend minors — each needs a dedicated migration PR.
Restoring deleted transcripts/duplicate docs is **not** authorised; publishing
exploit-detail `RED_TEAM_REVIEW.md` is **not** authorised.

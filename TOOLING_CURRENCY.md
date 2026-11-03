# Tooling, package and technology currency audit

**Date:** 2026-11-03 (snapshot) · updated same day with §0 implementation status
**Target:** `main` @ `43584ebc0456d4134cd6eabb396230c3f9ad3f9e` (post-merge of PR #1)
**Method:** parsed all 27 `package.json` manifests (root + 26 workspaces) and the text `bun.lock` (771 resolved packages), then queried live endpoints for every external dependency:

- `https://registry.npmjs.org/<pkg>` — `dist-tags.latest`, publish date, deprecation
- `https://api.github.com/repos/<owner>/<repo>/releases/latest` — Bun, TypeScript, Electron, GitHub Actions
- `https://api.github.com/advisories?ecosystem=npm&affects=<pkg>` — GitHub Advisory DB, version ranges matched with `semver`
- local: `bun install --frozen-lockfile --ignore-scripts`, `bun run typecheck`, `bun test`, `bun pm scan`

All version numbers below are **as published on 2026-11-03**; no data came from training memory. The tables in §§3–5 are the **pre-upgrade snapshot** — see §0 for what was subsequently changed.

---

## 0. Implementation status (post-review, same day)

The following changes were applied on branch `arena/f17dd9a4-locoworker` after
this audit was written. The tables below are kept as the original snapshot so
the "before" state stays auditable.

| Plan item | Status |
|-----------|--------|
| **Electron 31.7.7 → 45.2.1**, `electron-builder` 25.1.8 → **26.18.0** | ✅ Done. `apps/desktop` typechecks against the new types; the 45 advisories that matched 31.7.7 no longer apply. |
| **Dependency scanning in CI** | ✅ Done. `bunfig.toml` wires a repo-local `Bun.Security.Scanner` (`scripts/security-scanner.ts`) enforcing `security/advisories.json` on every install; CI runs `bun run scan`. A self-test confirmed a fatal rule aborts the scan. |
| **SBOM** | ✅ Done. `bun run sbom` parses `bun.lock` and emits a CycloneDX 1.6 SBOM (513 components); CI uploads it as an artifact. Generated file is gitignored. |
| **Remove dead dependencies** | ✅ Done. All six `@opentelemetry/*` packages, `react-syntax-highlighter` and its types were removed (0 references in `bun.lock`). |
| **Align version specs** | ✅ Done. All 21 `"latest"` specs replaced with `^1.3.13`; all `typescript` ranges aligned to `^5.9.3`; root `typescript` lock range drift fixed; `packageManager: "bun@1.4.4"` added; `engines.bun` raised to `>=1.4.4`; docs updated. |
| **CI action pins** | ✅ Done. `actions/checkout@v7.0.1`, `oven-sh/setup-bun@v2.2.0` (exact releases; SHA pinning is a follow-up). |
| **TypeScript 5.9 → 7.0** | ⏸ Deferred. Two majors behind; needs a dedicated migration PR across 26 composite projects. |
| **Vite 8 / plugin-react 6 / Tailwind 4.3** | ⏸ Deferred. Must move together; verify `vite-plugin-singlefile` compatibility. |
| **Provider SDK majors (`@anthropic-ai/sdk` 1.x, `openai` 7.x)** | ⏸ Deferred. Requires a review of `packages/core/src/providers/*` — the largest code change after Electron. |
| **React / framer-motion / lucide / recharts / `@types/*` minors** | ⏸ Deferred. Routine, no matching advisories; batch with a frontend test pass. |
| **Live OSV / npm audit in CI** | ⏸ Deferred. The scanner is offline-deterministic; feed the uploaded SBOM to an OSV scanner as a next step. |
| **Phase A/B supply-chain and resource-limit work (2026-11-03)** | ✅ No external version changes. Phase A added one `ajv` dependency to `@cowork/security`; Phase B added only workspace references (`@cowork/templates` → security, `@cowork/plugins` → core/security/marketplace) and regenerated `bun.lock`. The version snapshot in §§3–5 is unchanged. |

Electron was upgraded first because it was the only dependency with version-
matched high-severity advisories and the only end-of-life runtime.

## 1. Verdict

The foundation is **modern**: Bun 1.4.4 (current latest), TypeScript ESM with `moduleResolution: bundler` and composite project references, Bun workspaces with a text `bun.lock`, Vite 7 + `@tailwindcss/vite` 4 + React 19, and a real CI job. But the dependency set is **not current**:

- **11 of 30 external dependencies are ≥1 major version behind**; only **2** are exactly current, **2** are patch-behind and **15** are minor-behind (several of those "minor" gaps are ~250 releases).
- **Electron 31.7.7 is 14 majors / ~2.4 years behind** (v31.0.0 shipped 2024-06-10; current v45.2.1) and is **past end of life**. The GitHub Advisory DB has **45 advisories matching 31.7.7** (12 high, 25 medium, 8 low). This is the single concrete CVE exposure.
- Provider SDKs are 1–3 majors behind (`@anthropic-ai/sdk` 0.30.1 → 1.4.0; `openai` 4.104.0 → 7.47.0).
- TypeScript is 2 majors behind (5.9.3 → 7.0.2) and **manifest ranges are inconsistent** across the workspaces.
- **Six OpenTelemetry packages plus `react-syntax-highlighter` are dead dependencies** — declared, installed, and never imported.
- **No dependency audit, SBOM, lint/format, SAST or Dependabot/Renovate configuration exists**; `bun pm scan` (available in Bun 1.4.4) fails because no `[install.security] scanner` is configured in a `bunfig.toml`.

So: architecture = current; dependency hygiene = **materially stale**, with one high-risk EOL runtime.

---

## 2. Runtime, CI and build tooling

| Component | In repo | Latest (2026-11-03) | Assessment |
|-----------|---------|--------------------|------------|
| Bun runtime | CI pins `1.4.4`; `engines.bun >=1.2.0` | `bun-v1.4.4` | ✅ CI is on the latest release; `engines` floor is too loose (1.2 cannot be assumed to behave like 1.4) |
| `bun.lock` | text lockfile, `lockfileVersion: 1`, sha512 integrity | current format for Bun 1.4 | ✅ reproducible; `--frozen-lockfile` used in CI |
| TypeScript | root `^5.9.3`, 22 workspaces `^5.4.0`, one `5.9.3`, lock root `^5.5.4` | **7.0.2** (2026-07-08) | ⚠️ 2 majors behind **and** manifest/lock range drift |
| Vite | `7.3.2` | **8.3.5** | ⚠️ 1 major behind |
| `@vitejs/plugin-react` | `5.1.1` | **6.2.1** | ⚠️ 1 major behind (must move with Vite) |
| Electron | `^31.0.0` → `31.7.7` | **45.2.1** | 🔴 **EOL, 14 majors behind, 12 high-severity advisories affecting the locked version** |
| `electron-builder` | `^25.0.0` → `25.1.8` | **26.18.0** | ⚠️ 1 major behind (must move with Electron) |
| `actions/checkout` | `@v4` | **v7.0.1** | ⚠️ 3 majors behind, tag-pinned not SHA-pinned |
| `oven-sh/setup-bun` | `@v2` | **v2.2.0** | ✅ same major; still floating tag, not SHA-pinned |
| Runner / container | `ubuntu-latest`, `ubuntu:latest` in `BashTool.ts:85` | — | ⚠️ mutable tags; no digest pinning |
| Install | `bun install --frozen-lockfile --ignore-scripts` | — | ✅ reproducible, ⚠️ postinstall integrity/build steps never run |
| `packageManager` field | absent | — | ⚠️ no Corepack pin |
| `bunfig.toml` | absent | — | ⚠️ `bun pm scan` cannot run (no security scanner configured) |
| Lint / format / SAST / SBOM / dep-bot | none (`.github/` contains only `ci.yml`) | — | ⚠️ no ESLint/Biome, CodeQL, Dependabot or SBOM |

**Modern things worth keeping:** ESM with `.js` specifiers, `tsc -b` composite references across 26 workspaces, path aliases in `tsconfig.base.json`, Bun's built-in test runner, Tailwind 4 via the Vite plugin, React 19, `.gitignore` excluding `dist/`/generated state.

---

## 3. All external dependencies (declared → locked → latest)

`lag` compares the **locked** version with the registry's `latest`. "minor +252" means the project is on a 0.48-era release while current is 0.300 — a multi-year jump despite sharing a major number.

| Package | Declared range(s) | Locked | Latest | Latest published | Lag |
|---------|-------------------|--------|--------|------------------|-----|
| `@anthropic-ai/sdk` | ^0.30.1 | 0.30.1 | 1.4.0 | 2026-11-02 | **MAJOR +1** |
| `@opentelemetry/api` | ^1.7.0 | 1.9.1 | 1.10.0 | 2026-10-20 | minor +1 |
| `@opentelemetry/exporter-trace-otlp-http` | ^0.48.0 | 0.48.0 | 0.300.0 | 2026-10-20 | **minor +252 (effectively multi-year)** |
| `@opentelemetry/resources` | ^1.21.0 | 1.30.1 | 3.0.0 | 2026-10-20 | **MAJOR +2** |
| `@opentelemetry/sdk-node` | ^0.48.0 | 0.48.0 | 0.300.0 | 2026-10-20 | **minor +252 (effectively multi-year)** |
| `@opentelemetry/sdk-trace-base` | ^1.21.0 | 1.30.1 | 2.12.0 | 2026-10-06 | **MAJOR +1** |
| `@opentelemetry/semantic-conventions` | ^1.21.0 | 1.40.0 | 1.44.0 | 2026-10-28 | minor +4 |
| `@tailwindcss/vite` | 4.1.17 | 4.1.17 | 4.3.4 | 2026-11-02 | minor +2 |
| `@types/bun` | ^1.1.0, latest | 1.3.13 | 1.4.4 | 2026-10-23 | minor +1 |
| `@types/node` | 22.19.17, ^22.5.0 | 22.19.17 | 26.6.6 | 2026-10-28 | **MAJOR +4** |
| `@types/react` | 19.2.7 | 19.2.7 | 19.3.0 | 2026-09-09 | minor +1 |
| `@types/react-dom` | 19.2.3 | 19.2.3 | 19.3.0 | 2026-09-09 | minor +1 |
| `@types/react-syntax-highlighter` | ^15.5.13 | 15.5.13 | 15.5.13 | 2024-05-03 | current |
| `@vitejs/plugin-react` | 5.1.1 | 5.1.1 | 6.2.1 | 2026-11-02 | **MAJOR +1** |
| `bun-types` | latest | 1.3.13 | 1.4.4 | 2026-10-22 | minor +1 |
| `clsx` | 2.1.1 | 2.1.1 | 2.1.1 | 2024-04-23 | current |
| `electron` | ^31.0.0 | 31.7.7 | 45.2.1 | 2026-10-31 | **MAJOR +14** |
| `electron-builder` | ^25.0.0 | 25.1.8 | 26.18.0 | 2026-10-20 | **MAJOR +1** |
| `framer-motion` | ^12.38.0 | 12.38.0 | 14.9.0 | 2026-10-30 | **MAJOR +2** |
| `lucide-react` | ^1.14.0 | 1.14.0 | 1.67.0 | 2026-11-03 | **minor +53 (effectively multi-year)** |
| `openai` | ^4.67.0 | 4.104.0 | 7.47.0 | 2026-10-31 | **MAJOR +3** |
| `react` | 19.2.3 | 19.2.3 | 19.3.1 | 2026-10-14 | minor +1 |
| `react-dom` | 19.2.3 | 19.2.3 | 19.3.1 | 2026-10-14 | minor +1 |
| `react-syntax-highlighter` | ^16.1.1 | 16.1.1 | 16.1.2 | 2026-10-08 | patch +1 |
| `recharts` | ^3.8.1 | 3.8.1 | 3.10.1 | 2026-07-25 | minor +2 |
| `tailwind-merge` | 3.4.0 | 3.4.0 | 3.7.0 | 2026-09-12 | minor +3 |
| `tailwindcss` | 4.1.17 | 4.1.17 | 4.3.4 | 2026-11-02 | minor +2 |
| `typescript` | 5.9.3, ^5.4.0, ^5.9.3 | 5.9.3 | 7.0.2 | 2026-07-08 | **MAJOR +2** |
| `vite` | 7.3.2 | 7.3.2 | 8.3.5 | 2026-10-21 | **MAJOR +1** |
| `vite-plugin-singlefile` | 2.3.0 | 2.3.0 | 2.3.4 | 2026-10-17 | patch +4 |

**Notes on the outliers**

- `@opentelemetry/*`: the locked set is internally inconsistent (`sdk-node`/exporter at **0.48.0**, `api` 1.9.1, `resources`/`sdk-trace-base` 1.30.1, `semantic-conventions` 1.40.0). Current is `0.300.0` / `2.12.0` / `3.0.0`. `@opentelemetry/sdk-trace-base` is **deprecated on npm**: *"Use @opentelemetry/sdk-trace package"*. The repo declares them but `Tracer.ts:4-8` explicitly says it deliberately avoids the OTEL SDK — see §5.
- `@types/node` 22.19.17 vs 26.6.6: tracking Node 22 LTS typings while Node itself is `v22.22.3` in this sandbox. Not a defect, but 4 majors behind current typings.
- `lucide-react` 1.14.0 → 1.67.0 (53 minors, published 2026-11-03), `framer-motion` 12.38.0 → 14.9.0.
- `@types/bun` / `bun-types` are both at 1.3.13 vs 1.4.4 — and both names are used across manifests (redundant typings packages).

---

## 4. GitHub Advisory DB results (version-matched, not just package-matched)

Querying advisories by package name alone overstates risk, so each advisory's `vulnerable_version_range` was evaluated against the **locked** version with `semver`:

| Package | Locked | Advisories matching locked version | High/Critical |
|---------|--------|-----------------------------------|---------------|
| `electron` | 31.7.7 | **45** | **12** |
| `vite` | 7.3.2 | 0 | 0 |
| `react` / `react-dom` | 19.2.3 | 0 | 0 |
| `openai` | 4.104.0 | 0 | 0 |
| `@anthropic-ai/sdk` | 0.30.1 | 0 | 0 |
| `typescript`, `framer-motion`, `recharts`, `tailwindcss`, `electron-builder`, `@vitejs/plugin-react`, `@opentelemetry/sdk-node`, `lucide-react`, `clsx`, `react-syntax-highlighter`, `vite-plugin-singlefile` | — | 0 | 0 |

Recent Electron examples affecting 31.7.7: `GHSA-jr5w-w6x2-84p9` (2026-10-23, high), `GHSA-hq2x-r82h-9wj4` and `GHSA-gr2m-v5gq-v685` (2026-09-29, high — sandboxed-window/HTML-sandbox inheritance). Electron's supported release lines as of today are **v45.x, v44.x, v43.x**; v31 receives no security patches.

**Important caveat:** CI has no vulnerability scanning at all. `bun pm scan` exists in Bun 1.4.4 but returns `error: no security scanner configured` until `bunfig.toml` contains `[install.security] scanner = "<package>"`. Today these 45 advisories would only be found by a manual query like this one.

---

## 5. Dead and non-reproducible dependencies

- **All six `@opentelemetry/*` packages are unused.** A source scan of 334 files found zero imports; `packages/telemetry/src/trace/Tracer.ts:99` exports OTLP over a plain `fetch()` instead. They still pull in a transitive tree and are the most stale part of the lockfile. Remove them (or actually adopt the current SDK deliberately).
- **`react-syntax-highlighter` 16.1.1 and `@types/react-syntax-highlighter` 15.5.13 are unused.** No import in `apps/dashboard-frontend`.
- **21 of 27 manifests use `"latest"` as a version spec** for `@types/bun` or `bun-types` (2 app manifests + 19 package manifests; the root manifest uses `^1.1.0`). The lockfile pins 1.3.13 today, so `--frozen-lockfile` is safe — but a plain `bun install` or lockfile regeneration silently changes typings, and `latest` is a supply-chain smell. Replace with explicit ranges.
- **TypeScript range drift:** root `package.json` says `^5.9.3`, `bun.lock`'s root workspace record says `^5.5.4`, 22 workspaces say `^5.4.0`, one says `5.9.3`. All resolve to 5.9.3 so CI passes, but the manifests disagree.
- No `zod`/`ajv`-class runtime validator is declared — the hand-rolled `validateToolInput.ts` is shallow (see `RED_TEAM_REVIEW.md` R-10). Adopting one dependency would fix a live security gap.

---

## 6. Prioritised upgrade plan

| # | Action | Why / risk |
|---|--------|-----------|
| 1 | **Electron 31 → 45.x** (+ `electron-builder` → 26.x) | Closes 12 high-severity advisories. Breaking: Chromium/Node major jumps, `nodeIntegration`/IPC API changes; re-typecheck `apps/desktop` and smoke-test `main.ts`. Highest priority. |
| 2 | **Add dependency scanning to CI** | Configure `bunfig.toml` `[install.security] scanner` (or `osv-scanner`/`npm audit --package-lock-only` equivalent), add SBOM, add Dependabot/Renovate. Without this, finding #1 recurs. |
| 3 | **Remove the 6 unused OTel deps + `react-syntax-highlighter`** | Zero-risk cleanup; removes the most stale packages and shrinks install surface. |
| 4 | **Replace `"latest"` with explicit ranges; align all `typescript` ranges; add `packageManager: "bun@1.4.4"`** | Reproducibility. Regenerate `bun.lock` and verify `--frozen-lockfile`. |
| 5 | **Provider SDKs: `@anthropic-ai/sdk` → 1.x, `openai` → 7.x** | 1 and 3 majors behind; newer models/streaming/Responses APIs. Requires a review of `packages/core/src/providers/*` — likely the largest code change after Electron. |
| 6 | **TypeScript 5.9 → 7.0** | Two majors behind (TS 7 is the native-port line). Validate `moduleResolution: bundler`, composite references, `tsc -b`, and the frontend/desktop `--noEmit` configs before switching. Intermediate safe step: align all manifests to `^5.9.3`. |
| 7 | **Vite 8 + `@vitejs/plugin-react` 6 + Tailwind 4.3** | Move together; re-check `vite-plugin-singlefile` 2.3.4 compatibility and the `/api` proxy. Low security urgency (0 matching advisories). |
| 8 | **React 19.3.1, `framer-motion` 14, `lucide-react` 1.67, `recharts` 3.10, `tailwind-merge` 3.7, `@types/*`** | Routine minors; batch with a frontend test pass. |
| 9 | **CI hygiene** | `actions/checkout` → v7, pin both actions to commit SHAs, pin `ubuntu:latest` by digest, consider running postinstall scripts in a separate trusted job. |
| 10 | **Add lint/format/SAST** | No ESLint/Biome, CodeQL or pre-commit hooks exist. A registered-tool-manifest test in CI would also close the latent-tool risk (R-14). |

---

## 7. Cross-link to the security review

Three tooling decisions have direct security consequences:

1. **No `ajv`/`zod`** → hand-rolled, non-recursive `validateToolInput` → R-10 (nested/enum/union/oversized inputs accepted).
2. **`--ignore-scripts` + no audit scanner + unpinned actions/image** → no integrity signal on the supply chain → R-13 and F-17.
3. **EOL Electron 31** → 12 high-severity advisories in an app that already exposes `openExternal`/`openPath` IPC without a scheme allowlist → R-12.

---

## 8. Caveats

- Registry/advisory data is a point-in-time snapshot (2026-11-03). Re-run before acting.
- Advisory matching used `semver.satisfies()` on `vulnerable_version_range`; advisories without an npm `vulnerabilities` entry or with withdrawn status were excluded. Transitive dependencies (771 locked packages) were **not** individually version-matched — only the 17 directly declared high-visibility packages were. A full `bun pm scan`/`osv-scanner` run is needed for complete coverage.
- "Latest" is `dist-tags.latest`, not necessarily the best upgrade target: verify peer-dependency compatibility and breaking changes per the plan above.

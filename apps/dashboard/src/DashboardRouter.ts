import {
  MemorySystem,
  SessionManager,
  resolveSettings,
  validateSettingsPatch,
  getCoworkHome,
  DEFAULT_TOOLS,
  ensurePrivateDir,
  writePrivateFile,
} from "@cowork/core";
import { CostTracker } from "@cowork/telemetry/cost";
import { AuditLog } from "@cowork/security/audit";
import { HttpGuard } from "@cowork/security/network";
import { filterEnv } from "@cowork/security/env";
import { WikiStore } from "@cowork/wiki";
import { defaultKairosTasks } from "@cowork/kairos";
import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

export interface DashboardConfig {
  projectRoot: string;
  port: number;
  /** Bearer token. If absent an ephemeral token is generated and logged. */
  authToken?: string;
  /** Bind host (default 127.0.0.1). */
  hostname?: string;
}

const ALLOWED_ACTIONS = new Set(["build-graph", "export-logs"]);

/**
 * Local web dashboard.
 *
 * Security model: loopback bind by default, a required Bearer token for every
 * `/api/*` request, Origin/Sec-Fetch-Site CSRF checks, a fixed allowlist of
 * background actions, and a whitelist+validation layer for settings writes.
 * The previous unauthenticated `trigger-agent` action has been removed.
 */
export class DashboardRouter {
  private config: DashboardConfig;
  private guard: HttpGuard | null = null;

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.guard = new HttpGuard({
      serviceName: "CoWork dashboard",
      tokenEnvVar: "COWORK_DASHBOARD_AUTH_TOKEN",
      token: this.config.authToken,
      hostname: this.config.hostname,
    });
    this.guard.logStartup();
    const self = this;

    Bun.serve({
      ...this.guard.bindOptions,
      port: this.config.port,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        if (url.pathname === "/health") return Response.json({ ok: true });
        if (url.pathname === "/" || url.pathname === "/index.html") {
          return new Response(renderDashboardHTML(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (!url.pathname.startsWith("/api/")) return Response.json({ error: "Not found" }, { status: 404 });
        const denied = self.guard!.authorize(req);
        if (denied) return denied;
        try {
          return await self.route(req, url);
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    });
    process.stderr.write(
      `[Dashboard] Running at http://${this.guard.hostname}:${this.config.port} (project: ${this.config.projectRoot})\n`,
    );
  }

  /** Exposed for tests. */
  get httpGuard(): HttpGuard | null {
    return this.guard;
  }

  private async route(req: Request, url: URL): Promise<Response> {
    const { projectRoot } = this.config;
    const json = (data: unknown, status = 200) => Response.json(data, { status });

    // ── Real data sources ──────────────────────────────────────────────────

    if (url.pathname === "/api/memory") {
      const memory = new MemorySystem({ projectRoot });
      await memory.store.init();
      return json(await memory.store.list());
    }

    if (url.pathname === "/api/audit") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 1000);
      const log = new AuditLog({ projectRoot, sessionId: "dashboard" });
      await log.init();
      return json(await log.read(limit));
    }

    if (url.pathname === "/api/wiki") {
      const wiki = new WikiStore(projectRoot);
      await wiki.init();
      return json(await wiki.list());
    }

    if (url.pathname === "/api/sessions") {
      const manager = new SessionManager(projectRoot);
      await manager.init();
      return json(await manager.list(50));
    }

    if (url.pathname === "/api/analytics") {
      const tracker = new CostTracker();
      await tracker.init();
      return json({ daily: await tracker.summarize(1), monthly: await tracker.summarize(30) });
    }

    if (url.pathname === "/api/buddy/status") {
      const tracker = new CostTracker();
      await tracker.init();
      const daily = await tracker.summarize(1);
      const tokens = daily.totalInputTokens + daily.totalOutputTokens;
      const tired = tokens > 150_000 ? "Stressed" : tokens > 50_000 ? "Tired" : "Happy";
      return json({
        mood: tired,
        face: tired === "Stressed" ? "(x_x)" : tired === "Tired" ? "(-_-)" : "(^-^)",
        color: tired === "Stressed" ? "var(--red)" : tired === "Tired" ? "var(--yellow)" : "var(--green)",
        message: tired === "Happy" ? "Ready to work!" : "That was a lot of tokens...",
        tokens,
      });
    }

    if (url.pathname === "/api/kairos/tasks") return json(defaultKairosTasks());

    if (url.pathname === "/api/kairos/log") {
      return json(await readNdjson(join(projectRoot, ".cowork", "kairos", "daemon.ndjson"), 50));
    }

    if (url.pathname === "/api/research/experiments") {
      return json(await readNdjson(join(projectRoot, ".cowork", "research", "research-jobs.ndjson"), 50));
    }

    if (url.pathname === "/api/simulation/agents") {
      return json(await readNdjson(join(projectRoot, ".cowork", "mirofish", "agents.ndjson"), 50));
    }

    if (url.pathname === "/api/tasks") {
      return json(await readNdjson(join(projectRoot, ".cowork", "tasks.ndjson"), 200));
    }

    // Channel status is derived from configuration, never hard-coded as
    // "connected" for services that are not running.
    if (url.pathname === "/api/gateway/channels") {
      return json([
        { id: "http", name: "HTTP (this dashboard)", status: "connected" },
        {
          id: "telegram",
          name: "Telegram",
          status: process.env.COWORK_TELEGRAM_BOT_TOKEN ? "configured" : "not-configured",
        },
        { id: "discord", name: "Discord", status: "not-implemented" },
      ]);
    }

    if (url.pathname === "/api/tools") {
      return json(DEFAULT_TOOLS.map((t) => ({ name: t.name, description: t.description })));
    }

    if (url.pathname === "/api/graph") {
      try {
        return json(JSON.parse(await readFile(join(projectRoot, "graphify-out", "graph.json"), "utf-8")));
      } catch {
        return json({ nodes: [], edges: [], metadata: { nodeCount: 0, edgeCount: 0 }, stale: true });
      }
    }

    if (url.pathname === "/api/status") {
      const memoryRoot = join(MemorySystem.rootFor(projectRoot), "memory");
      const daemonPid = await readText(join(projectRoot, ".cowork", "kairos", "daemon.pid"));
      let daemonRunning = false;
      if (daemonPid) {
        try { process.kill(Number(daemonPid), 0); daemonRunning = true; } catch { /* not running */ }
      }
      const log = new AuditLog({ projectRoot, sessionId: "dashboard" });
      await log.init();
      return json({
        project: projectRoot.split("/").pop(),
        serverTime: new Date().toISOString(),
        version: "0.1.0",
        daemonRunning,
        stats: {
          memory: (await readdir(memoryRoot).catch(() => [])).length,
          wiki: (await readdir(join(projectRoot, ".cowork", "wiki")).catch(() => [])).length,
          audit: (await log.read(0)).length,
        },
      });
    }

    if (url.pathname === "/api/settings") {
      if (req.method === "POST") {
        let patch: unknown;
        try { patch = await req.json(); }
        catch { return json({ error: "Invalid JSON" }, 400); }
        let validated: Record<string, unknown>;
        try { validated = validateSettingsPatch(patch) as Record<string, unknown>; }
        catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 400); }
        // Write to the *user* settings file (trusted), never to a cloned repo.
        const home = getCoworkHome();
        await ensurePrivateDir(home);
        const path = join(home, "settings.json");
        let current: Record<string, unknown> = {};
        try { current = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>; } catch { /* new file */ }
        await writePrivateFile(path, JSON.stringify({ ...current, ...validated }, null, 2));
        return json({ status: "saved", keys: Object.keys(validated) });
      }
      const settings = await resolveSettings(projectRoot, process.env);
      // Never return credentials to a browser, even with a valid token.
      const {
        apiKey: _apiKey,
        embedderApiKey: _embedderKey,
        mcpServers: _mcpServers,
        ...safe
      } = settings;
      return json(safe);
    }

    // ── Actions (fixed allowlist, fixed arguments, no user-controlled shell) ─

    if (url.pathname.startsWith("/api/actions/") && req.method === "POST") {
      const action = url.pathname.slice("/api/actions/".length);
      if (!ALLOWED_ACTIONS.has(action)) {
        return json({ error: `Action not allowed: ${action}` }, 403);
      }
      if (action === "build-graph") {
        const proc = spawn(process.execPath, ["run", "build:graph"], {
          cwd: projectRoot,
          env: filterEnv(process.env),
          detached: true,
          stdio: "ignore",
        });
        proc.unref();
        return json({ status: "started", action, pid: proc.pid });
      }
      const log = new AuditLog({ projectRoot, sessionId: "dashboard" });
      await log.init();
      const entries = await log.read(0);
      return new Response(JSON.stringify(entries, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="cowork-audit-log.json"',
        },
      });
    }

    return json({ error: "Not found" }, 404);
  }
}

async function readNdjson(path: string, limit: number): Promise<unknown[]> {
  try {
    const raw = await readFile(path, "utf-8");
    const rows = raw.split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    return rows.slice(-limit);
  } catch {
    return [];
  }
}

async function readText(path: string): Promise<string | null> {
  try { return (await readFile(path, "utf-8")).trim(); } catch { return null; }
}

function renderDashboardHTML(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CoWork Dashboard</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--fg:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif}
header{display:flex;gap:16px;align-items:center;padding:16px 24px;border-bottom:1px solid var(--border)}
h1{font-size:18px;margin:0}nav{display:flex;gap:8px;margin-left:auto}button{background:var(--card);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:6px 12px;cursor:pointer}button.active{border-color:var(--accent);color:var(--accent)}
main{padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;min-height:120px}
pre{white-space:pre-wrap;word-break:break-word;color:var(--muted);font-size:12px;max-height:420px;overflow:auto}
.badge{display:inline-block;border:1px solid var(--border);border-radius:4px;padding:1px 6px;margin-right:6px;color:var(--muted)}
</style></head><body>
<header><h1>⚡ CoWork</h1><span id="status" style="color:var(--muted)">Checking…</span>
<nav><button class="active" data-tab="overview">Overview</button><button data-tab="memory">Memory</button><button data-tab="audit">Audit</button><button data-tab="graph">Graph</button><button data-tab="settings">Settings</button></nav></header>
<main><div class="card" id="view">Loading…</div></main>
<script>
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token = localStorage.getItem('cowork_dashboard_token') || '';
async function api(path, options = {}) {
  if (!token) token = prompt('Dashboard bearer token (printed by the server at startup):') || '';
  localStorage.setItem('cowork_dashboard_token', token);
  const res = await fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token } });
  if (res.status === 401) { token = ''; localStorage.removeItem('cowork_dashboard_token'); throw new Error('Unauthorized — reload and enter the token again'); }
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()));
  return res.json();
}
async function render(tab) {
  const view = document.getElementById('view');
  view.textContent = 'Loading…';
  try {
    if (tab === 'overview') {
      const s = await api('/api/status');
      view.innerHTML = '<h2>' + esc(s.project) + '</h2><pre>' + esc(JSON.stringify(s.stats, null, 2)) + '</pre><p>Daemon running: ' + (s.daemonRunning ? '✅' : 'no') + '</p>';
    } else if (tab === 'memory') {
      const rows = await api('/api/memory');
      view.innerHTML = '<h2>Memory (' + rows.length + ')</h2>' + rows.map(e => '<p><span class="badge">' + esc(e.type) + '</span>' + esc(e.name) + '</p>').join('') || '<p>No memories yet.</p>';
    } else if (tab === 'audit') {
      const rows = await api('/api/audit');
      view.innerHTML = '<h2>Audit (' + rows.length + ')</h2><pre>' + esc(rows.slice(-50).reverse().map(e => e.timestamp + ' ' + e.kind + ' ' + (e.toolName || '') + ' ' + (e.outcome || '')).join('\\n')) + '</pre>';
    } else if (tab === 'graph') {
      const g = await api('/api/graph');
      view.innerHTML = '<h2>Knowledge graph (' + esc((g.metadata || {}).nodeCount || 0) + ' nodes)</h2>' + (g.stale ? '<p>No graph yet. Run <code>bun run build:graph</code>.</p>' : '');
    } else {
      const s = await api('/api/settings');
      view.innerHTML = '<h2>Settings</h2><pre>' + esc(JSON.stringify(s, null, 2)) + '</pre>';
    }
    document.getElementById('status').textContent = 'Connected';
  } catch (e) { view.textContent = 'Error: ' + e.message; document.getElementById('status').textContent = 'Not connected'; }
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); render(b.dataset.tab);
});
render('overview');
</script></body></html>`;
}

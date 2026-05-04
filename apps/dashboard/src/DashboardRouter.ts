import { MemorySystem } from "@cowork/core";
import { CostTracker } from "@cowork/analytics";
import { AuditLog } from "@cowork/security";
import { LLMWiki } from "@cowork/wiki";

export interface DashboardConfig {
  projectRoot: string;
  port: number;
}

export class DashboardRouter {
  private config: DashboardConfig;

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const self = this;
    Bun.serve({
      port: this.config.port,
      async fetch(req) {
        return self.route(req);
      },
    });
    console.log(`[Dashboard] Running at http://localhost:${this.config.port}`);
    console.log(`[Dashboard] Project: ${this.config.projectRoot}`);
    // Keep alive
    await new Promise<never>(() => {});
  }

  private async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { projectRoot } = this.config;

    // ── API routes ─────────────────────────────────────────────────────────

    if (url.pathname === "/api/memory") {
      const memory = new MemorySystem(projectRoot);
      const type = (url.searchParams.get("type") as any) ?? undefined;
      const entries = await memory.list(type);
      return Response.json(entries);
    }

    if (url.pathname === "/api/analytics") {
      const tracker = new CostTracker(projectRoot, "dashboard");
      const today = new Date().toISOString().slice(0, 10);
      const daily = await tracker.dailySummary(today);
      const monthly = await tracker.monthlySummary();
      return Response.json({ daily, monthly });
    }

    if (url.pathname === "/api/audit") {
      const log = new AuditLog(projectRoot, "dashboard");
      const entries = await log.query({
        date: url.searchParams.get("date") ?? undefined,
        risk: (url.searchParams.get("risk") as any) ?? undefined,
        limit: 100,
      });
      return Response.json(entries);
    }

    if (url.pathname === "/api/wiki") {
      const wiki = new LLMWiki({ projectRoot });
      const slug = url.searchParams.get("slug");
      if (slug) {
        const page = await wiki.getPage(slug);
        return Response.json(page ?? { error: "Not found" });
      }
      const pages = await wiki.listPages();
      return Response.json(pages);
    }

    if (url.pathname === "/api/status") {
      return Response.json({
        projectRoot,
        serverTime: new Date().toISOString(),
        version: "0.1.0-phase4",
      });
    }

    // ── UI ─────────────────────────────────────────────────────────────────

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(renderDashboardHTML(this.config), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

function renderDashboardHTML(config: DashboardConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CoWork Dashboard</title>
  <style>
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --border: #2a2a2a;
      --text: #e8e8e8; --muted: #888; --accent: #7c6af7;
      --green: #4caf82; --red: #e05757; --yellow: #e8b84b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'SF Mono', monospace; font-size: 13px; }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
    header h1 { font-size: 16px; color: var(--accent); }
    header span { color: var(--muted); font-size: 11px; }
    nav { display: flex; gap: 8px; margin-left: auto; }
    nav button { background: none; border: 1px solid var(--border); color: var(--muted); padding: 4px 12px; cursor: pointer; border-radius: 4px; font-family: inherit; font-size: 12px; }
    nav button.active { border-color: var(--accent); color: var(--accent); }
    main { padding: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 12px; }
    .stat { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: var(--muted); }
    .stat-value { color: var(--text); font-weight: 500; }
    .list-item { padding: 6px 0; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: baseline; }
    .list-item:last-child { border-bottom: none; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; background: var(--border); color: var(--muted); }
    .badge.high { background: #e0575720; color: var(--red); }
    .badge.medium { background: #e8b84b20; color: var(--yellow); }
    .badge.low { background: #4caf8220; color: var(--green); }
    pre { background: var(--bg); padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px; line-height: 1.5; }
    .full-width { grid-column: 1 / -1; }
    #status { font-size: 11px; color: var(--muted); padding: 4px 8px; background: var(--border); border-radius: 4px; }
  </style>
</head>
<body>
<header>
  <h1>⚡ CoWork</h1>
  <span>${config.projectRoot}</span>
  <nav>
    <button class="active" onclick="showTab('overview')">Overview</button>
    <button onclick="showTab('memory')">Memory</button>
    <button onclick="showTab('wiki')">Wiki</button>
    <button onclick="showTab('audit')">Audit</button>
    <button onclick="showTab('analytics')">Analytics</button>
  </nav>
  <span id="status">loading…</span>
</header>
<main id="content">
  <div class="card full-width"><pre>Loading dashboard…</pre></div>
</main>

<script>
const api = (path) => fetch(path).then(r => r.json());
let currentTab = 'overview';

async function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  await render(tab);
}

async function render(tab) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card full-width"><pre>Loading…</pre></div>';

  try {
    if (tab === 'overview') await renderOverview(content);
    else if (tab === 'memory') await renderMemory(content);
    else if (tab === 'wiki') await renderWiki(content);
    else if (tab === 'audit') await renderAudit(content);
    else if (tab === 'analytics') await renderAnalytics(content);
  } catch (e) {
    content.innerHTML = '<div class="card full-width"><pre>Error: ' + e.message + '</pre></div>';
  }
}

async function renderOverview(el) {
  const [status, analytics] = await Promise.all([api('/api/status'), api('/api/analytics')]);
  const daily = analytics.daily;
  el.innerHTML = \`
    <div class="card">
      <h2>Status</h2>
      <div class="stat"><span class="stat-label">Project</span><span class="stat-value">\${status.projectRoot.split('/').pop()}</span></div>
      <div class="stat"><span class="stat-label">Version</span><span class="stat-value">\${status.version}</span></div>
      <div class="stat"><span class="stat-label">Server time</span><span class="stat-value">\${new Date(status.serverTime).toLocaleTimeString()}</span></div>
    </div>
    <div class="card">
      <h2>Today's Usage</h2>
      \${daily ? \`
      <div class="stat"><span class="stat-label">Estimated cost</span><span class="stat-value">$\${daily.totalCostUsd.toFixed(4)}</span></div>
      <div class="stat"><span class="stat-label">Input tokens</span><span class="stat-value">\${daily.totalInputTokens.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Output tokens</span><span class="stat-value">\${daily.totalOutputTokens.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Sessions</span><span class="stat-value">\${daily.sessionCount}</span></div>
      \` : '<p style="color:var(--muted)">No data for today yet</p>'}
    </div>
  \`;
}

async function renderMemory(el) {
  const entries = await api('/api/memory');
  const items = entries.slice(0, 50).map(e => \`
    <div class="list-item">
      <span class="badge \${e.type}">\${e.type}</span>
      <span>\${e.name}</span>
      <span style="color:var(--muted);margin-left:auto;font-size:11px">\${(e.confidence * 100).toFixed(0)}%</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card full-width">
      <h2>Memory Entries (\${entries.length})</h2>
      \${items || '<p style="color:var(--muted)">No memories found</p>'}
    </div>
  \`;
}

async function renderWiki(el) {
  const pages = await api('/api/wiki');
  const items = pages.map(p => \`
    <div class="list-item">
      <span class="badge">\${p.version > 1 ? 'v'+p.version : 'new'}</span>
      <span>\${p.title}</span>
      <span style="color:var(--muted);margin-left:auto;font-size:11px">\${p.updatedAt.slice(0,10)}</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card full-width">
      <h2>Wiki Pages (\${pages.length})</h2>
      \${items || '<p style="color:var(--muted)">Wiki is empty</p>'}
    </div>
  \`;
}

async function renderAudit(el) {
  const entries = await api('/api/audit');
  const items = entries.slice(-30).reverse().map(e => \`
    <div class="list-item">
      <span class="badge \${e.risk}">\${e.risk}</span>
      <span>\${e.event}</span>
      <span style="color:var(--muted)">\${e.actor}</span>
      <span style="color:var(--muted);margin-left:auto;font-size:11px">\${e.ts.slice(11,19)}</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card full-width">
      <h2>Audit Log (today, last 30)</h2>
      \${items || '<p style="color:var(--muted)">No audit entries today</p>'}
    </div>
  \`;
}

async function renderAnalytics(el) {
  const analytics = await api('/api/analytics');
  const monthly = analytics.monthly;
  const items = (monthly.dailyBreakdown ?? []).map(d => \`
    <div class="stat">
      <span class="stat-label">\${d.date}</span>
      <span class="stat-value">$\${d.totalCostUsd.toFixed(4)} · \${(d.totalInputTokens+d.totalOutputTokens).toLocaleString()} tokens</span>
    </div>
  \`).join('');
  el.innerHTML = \`
    <div class="card">
      <h2>Monthly Summary: \${monthly.month}</h2>
      <div class="stat"><span class="stat-label">Total cost</span><span class="stat-value">$\${monthly.totalCostUsd.toFixed(4)}</span></div>
      <div class="stat"><span class="stat-label">Total tokens</span><span class="stat-value">\${monthly.totalTokens.toLocaleString()}</span></div>
    </div>
    <div class="card">
      <h2>Daily Breakdown</h2>
      \${items || '<p style="color:var(--muted)">No monthly data</p>'}
    </div>
  \`;
}

// Boot
async function init() {
  try {
    const status = await api('/api/status');
    document.getElementById('status').textContent = 'connected · ' + new Date(status.serverTime).toLocaleTimeString();
  } catch {
    document.getElementById('status').textContent = 'offline';
  }
  await render('overview');
}

init();
setInterval(() => {
  if (currentTab === 'overview') render('overview');
}, 15_000);
</script>
</body>
</html>`;
}

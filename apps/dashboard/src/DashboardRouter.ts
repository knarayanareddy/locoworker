import { MemorySystem, resolveSettings, SessionManager } from "@cowork/core";
import { CostTracker } from "@cowork/telemetry/cost";
import { AuditLog } from "@cowork/security/audit";
import { WikiStore } from "@cowork/wiki";
import { KAIROSDaemon, defaultKairosTasks } from "@cowork/kairos";
import { AutoResearch } from "@cowork/research";
import { join } from "node:path";
import { readFile, mkdir, writeFile, stat, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

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
  }

  private async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { projectRoot } = this.config;

    // ── API routes ─────────────────────────────────────────────────────────

    if (url.pathname === "/api/memory") {
      const memory = new MemorySystem({ projectRoot });
      await memory.store.init();
      const entries = await memory.store.list();
      return Response.json(entries || []);
    }

    if (url.pathname === "/api/analytics") {
      try {
        const tracker = new CostTracker();
        await tracker.init();
        const daily = await tracker.summarize(1);
        const monthly = await tracker.summarize(30);
        return Response.json({ daily, monthly });
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    if (url.pathname === "/api/audit") {
      const log = new AuditLog({ projectRoot, sessionId: "dashboard" });
      await log.init();
      const entries = await log.read();
      return Response.json(entries || []);
    }

    if (url.pathname === "/api/wiki") {
      const wiki = new WikiStore(projectRoot);
      await wiki.init();
      const pages = await wiki.list();
      return Response.json(pages);
    }

    if (url.pathname === "/api/tasks") {
      try {
        const path = join(projectRoot, ".cowork", "tasks.ndjson");
        const raw = await readFile(path, "utf-8");
        const tasks = raw.split("\n").filter(Boolean).map(l => JSON.parse(l));
        return Response.json(tasks);
      } catch {
        return Response.json([]);
      }
    }

    if (url.pathname === "/api/sessions") {
      const manager = new SessionManager(projectRoot);
      await manager.init();
      const records = await manager.list(50);
      return Response.json(records);
    }

    if (url.pathname === "/api/kairos/tasks") {
      const tasks = defaultKairosTasks();
      // In a real app, we'd merge this with runtime state
      return Response.json(tasks);
    }

    if (url.pathname === "/api/kairos/log") {
      // Mocking some log for now, will connect to real event stream later
      return Response.json([
        { time: new Date().toLocaleTimeString(), action: 'KAIROS Tick', type: 'quiet' },
        { time: new Date(Date.now() - 60000).toLocaleTimeString(), action: 'Memory consolidation triggered', type: 'act' },
      ]);
    }

    if (url.pathname === "/api/research/experiments") {
      try {
        const path = join(projectRoot, ".cowork", "research", "research-jobs.json");
        const raw = await readFile(path, "utf-8");
        const jobs = JSON.parse(raw);
        return Response.json(jobs);
      } catch {
        return Response.json([]);
      }
    }

    if (url.pathname === "/api/simulation/agents") {
      // MiroFish agents placeholder
      return Response.json([
        { id: 'a1', name: 'Agent_Alpha', persona: 'Technical leader', sentiment: 0.9 },
        { id: 'a2', name: 'Agent_Beta', persona: 'Security skeptic', sentiment: 0.4 },
      ]);
    }

    if (url.pathname === "/api/gateway/channels") {
      return Response.json([
        { id: 'telegram', name: 'Telegram', status: 'connected' },
        { id: 'discord', name: 'Discord', status: 'connected' },
      ]);
    }

    if (url.pathname === "/api/tools") {
      return Response.json([
        { name: "FileReadTool", description: "Read files in workspace" },
        { name: "FileWriteTool", description: "Edit files with diffs" },
        { name: "BashTool", description: "Execute shell commands" },
        { name: "WebSearchTool", description: "Search the web" },
        { name: "MemorySearchTool", description: "Search agent memory" },
        { name: "GitTool", description: "Git operations" },
      ]);
    }

    if (url.pathname === "/api/settings") {
      if (req.method === "POST") {
        const updates = await req.json();
        const path = join(projectRoot, ".cowork", "settings.json");
        await mkdir(join(projectRoot, ".cowork"), { recursive: true });
        
        let current = {};
        try { current = JSON.parse(await readFile(path, "utf-8")); } catch {}
        
        const next = { ...current, ...updates };
        await writeFile(path, JSON.stringify(next, null, 2), "utf-8");
        return Response.json({ status: "saved" });
      }

      const settings = await resolveSettings(projectRoot, process.env);
      return Response.json(settings);
    }

    if (url.pathname === "/api/graph") {
      try {
        const path = join(projectRoot, "graphify-out", "graph.json");
        const raw = await readFile(path, "utf-8");
        const snapshot = JSON.parse(raw);
        return Response.json(snapshot);
      } catch {
        return Response.json({ nodes: [], edges: [], metadata: { nodeCount: 0, edgeCount: 0 } });
      }
    }

    if (url.pathname === "/api/status") {
      return Response.json({
        projectRoot,
        serverTime: new Date().toISOString(),
        version: "0.1.0-phase8",
        daemonRunning: true,
        stats: {
          memory: (await readdir(join(projectRoot, ".cowork", "memory")).catch(() => [])).length,
          wiki: (await readdir(join(projectRoot, ".cowork", "wiki")).catch(() => [])).length,
          audit: (await readFile(join(projectRoot, ".cowork", "audit.log"), "utf-8").catch(() => "")).split("\n").length,
        }
      });
    }

    if (url.pathname === "/api/buddy/status") {
      try {
        const tracker = new CostTracker();
        await tracker.init();
        const daily = await tracker.summarize(1);
        const tokens = (daily.totalInputTokens || 0) + (daily.totalOutputTokens || 0);
        
        let mood = "Happy";
        let face = "(^-^)";
        let color = "var(--green)";
        let message = "Ready to work!";
        
        if (tokens > 50000) {
          mood = "Tired";
          face = "(-_-)";
          color = "var(--yellow)";
          message = "Phew, that was a lot of tokens...";
        }
        if (tokens > 150000) {
          mood = "Stressed";
          face = "(x_x)";
          color = "var(--red)";
          message = "My context window hurts!";
        }

        return Response.json({ mood, face, color, message, tokens });
      } catch {
        return Response.json({ mood: "Unknown", face: "(O_O)", color: "var(--muted)", message: "Where am I?", tokens: 0 });
      }
    }

    // ── Actions ────────────────────────────────────────────────────────────

    if (url.pathname === "/api/actions/build-graph" && req.method === "POST") {
      const proc = spawn("bun", ["run", "build:graph"], { cwd: projectRoot, detached: true });
      proc.unref();
      return Response.json({ status: "started" });
    }

    if (url.pathname === "/api/actions/trigger-agent" && req.method === "POST") {
      const { prompt } = await req.json();
      const proc = spawn("bun", ["run", "cowork", "--non-interactive", prompt], { 
        cwd: projectRoot, 
        detached: true,
        stdio: 'ignore'
      });
      proc.unref();
      return Response.json({ status: "started", pid: proc.pid });
    }

    if (url.pathname === "/api/actions/export-logs" && req.method === "POST") {
      const log = new AuditLog({ projectRoot, sessionId: "dashboard" });
      await log.init();
      const entries = await log.read();
      return new Response(JSON.stringify(entries, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="cowork-audit-log.json"',
        },
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #050505; --surface: #0f0f0f; --card-bg: #141414; --border: #222;
      --text: #f0f0f0; --muted: #888; --accent: #9333ea; --accent-soft: rgba(147, 51, 234, 0.1);
      --green: #10b981; --red: #ef4444; --yellow: #f59e0b; --glass: rgba(255, 255, 255, 0.03);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; font-size: 14px; background-image: radial-gradient(circle at 50% 0%, #1a0b2e 0%, transparent 50%); min-height: 100vh; padding-bottom: 60px; }
    header { background: rgba(15, 15, 15, 0.8); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); padding: 16px 32px; display: flex; align-items: center; gap: 24px; position: sticky; top: 0; z-index: 100; }
    header h1 { font-size: 20px; font-weight: 600; background: linear-gradient(135deg, #fff 0%, #9333ea 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    header .path { color: var(--muted); font-size: 12px; font-family: 'JetBrains Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px; }
    nav { display: flex; gap: 4px; margin-left: auto; background: var(--surface); padding: 4px; border-radius: 8px; border: 1px solid var(--border); }
    nav button { background: none; border: none; color: var(--muted); padding: 6px 16px; cursor: pointer; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 500; transition: all 0.2s ease; }
    nav button:hover { color: #fff; background: var(--glass); }
    nav button.active { background: var(--accent); color: #fff; box-shadow: 0 4px 12px rgba(147, 51, 234, 0.3); }
    main { padding: 32px; max-width: 1600px; margin: 0 auto; display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative; }
    .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
    .card h2::after { content: ''; height: 1px; flex: 1; background: var(--border); }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; }
    .stat-box { background: var(--surface); padding: 16px; border-radius: 8px; border: 1px solid var(--border); }
    .stat-label { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .stat-value { font-size: 20px; font-weight: 600; color: #fff; }
    .list-item { padding: 12px; border-radius: 8px; margin-bottom: 8px; background: var(--surface); border: 1px solid transparent; display: flex; gap: 12px; align-items: center; transition: all 0.2s ease; }
    .list-item:hover { border-color: var(--border); background: var(--card-bg); transform: translateX(4px); }
    .badge { font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; background: var(--border); color: var(--muted); letter-spacing: 0.05em; }
    .badge.complete { background: #10b98120; color: var(--green); }
    .badge.running { background: #3b82f620; color: #3b82f6; }
    .feed { max-height: 400px; overflow-y: auto; padding-right: 8px; }
    .feed-item { border-left: 2px solid var(--border); padding-left: 16px; margin-bottom: 16px; position: relative; }
    .feed-item::before { content: ''; width: 8px; height: 8px; background: var(--border); border-radius: 50%; position: absolute; left: -5px; top: 4px; }
    .feed-item.active::before { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
    .feed-time { font-size: 10px; color: var(--muted); font-family: 'JetBrains Mono'; }
    .col-4 { grid-column: span 4; } .col-6 { grid-column: span 6; } .col-8 { grid-column: span 8; } .col-12 { grid-column: span 12; }
    #status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); display: inline-block; box-shadow: 0 0 10px var(--green); }
    .progress-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 12px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--accent); width: 0%; transition: width 0.5s ease; }
    .action-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 10px 16px; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 13px; transition: all 0.2s; display: flex; align-items: center; gap: 8px; width: 100%; }
    .action-btn:hover { border-color: var(--accent); background: var(--accent-soft); color: #fff; }
    .input-field { background: var(--surface); border: 1px solid var(--border); color: #fff; padding: 10px; border-radius: 6px; width: 100%; margin-bottom: 12px; font-family: inherit; font-size: 13px; }
    .input-field:focus { outline: none; border-color: var(--accent); }
    #modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; }
    #modal.open { display: flex; }
    .modal-content { background: var(--card-bg); border: 1px solid var(--border); padding: 32px; border-radius: 16px; width: 500px; box-shadow: 0 20px 50px rgba(0,0,0,1); }
    #buddy-widget { position: fixed; bottom: 24px; right: 24px; background: var(--card-bg); border: 1px solid var(--border); padding: 16px; border-radius: 12px; display: flex; align-items: center; gap: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 50; transition: transform 0.2s; cursor: pointer; }
    #buddy-widget:hover { transform: translateY(-4px); }
    #buddy-face { font-size: 24px; font-weight: bold; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 2px solid var(--border); }
    #buddy-info { display: flex; flex-direction: column; }
    #buddy-mood { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    #buddy-msg { font-size: 11px; color: var(--muted); }
  </style>
</head>
<body>
<header>
  <h1>⚡ CoWork</h1>
  <span class="path">${config.projectRoot}</span>
  <nav id="nav">
    <button class="active" onclick="showTab('overview')">Overview</button>
    <button onclick="showTab('memory')">Memory</button>
    <button onclick="showTab('gantt')">Gantt (UltraPlan)</button>
    <button onclick="showTab('graph')">Graph</button>
    <button onclick="showTab('daemon')">Daemon</button>
    <button onclick="showTab('analytics')">Analytics</button>
  </nav>
  <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)">
    <span id="status-dot"></span>
    <span id="status-text">Connected</span>
  </div>
</header>
<main id="content"></main>

<div id="modal">
  <div class="modal-content">
    <h2 id="modal-title" style="margin-bottom:24px">Title</h2>
    <div id="modal-body"></div>
    <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:24px">
      <button class="action-btn" style="width:auto" onclick="closeModal()">Cancel</button>
      <button id="modal-action" class="action-btn" style="width:auto; background:var(--accent); color:#fff">Save</button>
    </div>
  </div>
</div>

<div id="buddy-widget">
  <div id="buddy-face">(^-^)</div>
  <div id="buddy-info">
    <span id="buddy-mood">Happy</span>
    <span id="buddy-msg">Ready to work!</span>
  </div>
</div>

<script>
const api = (path) => fetch(path).then(r => r.json());
const post = (path, body) => fetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }).then(r => r.json());

let currentTab = 'overview';

function openModal(title, body, actionText, onAction) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const actionBtn = document.getElementById('modal-action');
  if (actionText) {
    actionBtn.style.display = 'block';
    actionBtn.textContent = actionText;
    actionBtn.onclick = onAction;
  } else {
    actionBtn.style.display = 'none';
  }
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }

async function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('#nav button')).find(b => b.textContent.toLowerCase() === tab);
  if (btn) btn.classList.add('active');
  await render(tab);
}

async function render(tab) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card col-12"><pre>Loading...</pre></div>';
  try {
    if (tab === 'overview') await renderOverview(content);
    else if (tab === 'memory') await renderMemory(content);
    else if (tab === 'gantt') await renderGantt(content);
    else if (tab === 'graph') await renderGraph(content);
    else if (tab === 'daemon') await renderDaemon(content);
    else if (tab === 'analytics') await renderAnalytics(content);
  } catch (e) { content.innerHTML = '<div class="card col-12"><pre>Error: ' + e.message + '</pre></div>'; }
}

async function renderGantt(el) {
  const tasks = await api('/api/tasks');
  if (tasks.length === 0) {
    el.innerHTML = '<div class="card col-12"><h2>UltraPlan Gantt</h2><p>No tasks found. Run /ultraplan in the CLI.</p></div>';
    return;
  }
  // Group by parentId
  const groups = {};
  tasks.forEach(t => {
    const pid = t.parentId || 'orphan';
    if (!groups[pid]) groups[pid] = [];
    groups[pid].push(t);
  });

  let html = '<div class="card col-12"><h2>UltraPlan Gantt</h2>';
  for (const [pid, subtasks] of Object.entries(groups)) {
    html += \`<div style="margin-bottom: 24px;"><h3>Plan \${pid.slice(0,8)}</h3><div style="margin-top:12px;">\`;
    for (const t of subtasks) {
      let width = 100;
      let color = 'var(--muted)';
      if (t.status === 'complete') color = 'var(--green)';
      else if (t.status === 'failed') color = 'var(--red)';
      else if (t.status === 'running') color = 'var(--accent)';
      
      html += \`
      <div style="display:flex; align-items:center; margin-bottom:8px; gap:12px;">
        <div style="width:120px; font-size:12px; color:var(--muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">\${t.prompt}</div>
        <div style="flex:1; background:var(--surface); height:24px; border-radius:4px; position:relative; overflow:hidden;">
          <div style="position:absolute; left:0; top:0; height:100%; width:\${width}%; background:\${color}; opacity:0.8;"></div>
          <div style="position:absolute; left:8px; top:4px; font-size:10px; font-weight:bold; color:#fff;">\${t.status.toUpperCase()}</div>
        </div>
      </div>\`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

async function renderOverview(el) {
  const [status, analytics, audit, wiki, memory, tasks] = await Promise.all([
    api('/api/status'), api('/api/analytics'), api('/api/audit'), api('/api/wiki'), api('/api/memory'), api('/api/tasks')
  ]);
  const daily = analytics.daily || {};
  el.innerHTML = \`
    <div class="card col-4">
      <h2>Project Status</h2>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Basename</div><div class="stat-value">\${status.projectRoot.split('/').pop()}</div></div>
        <div class="stat-box"><div class="stat-label">Version</div><div class="stat-value">\${status.version}</div></div>
      </div>
    </div>
    <div class="card col-8">
      <h2>Today's Usage</h2>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Cost</div><div class="stat-value">\${daily.formattedCost || '$0.00'}</div></div>
        <div class="stat-box"><div class="stat-label">Tokens</div><div class="stat-value">\${((daily.totalInputTokens || 0) + (daily.totalOutputTokens || 0)).toLocaleString()}</div></div>
        <div class="stat-box"><div class="stat-label">Sessions</div><div class="stat-value">\${daily.totalSessions || 0}</div></div>
      </div>
    </div>
    <div class="card col-6">
      <h2>Activity Feed</h2>
      <div class="feed">\${audit.length > 0 ? audit.slice(-12).reverse().map(e => \`<div class="feed-item"><div class="feed-time">\${new Date(e.timestamp).toLocaleTimeString()}</div><div>\${e.kind} - \${e.actor}</div></div>\`).join('') : '<p>No activity</p>'}</div>
    </div>
    <div class="card col-6">
      <h2>Task Queue</h2>
      <div class="feed">\${tasks.length > 0 ? tasks.slice(-10).reverse().map(t => \`<div class="list-item"><span class="badge \${t.status}">\${t.status}</span><span style="flex:1">\${t.prompt}</span></div>\`).join('') : '<p>Queue is empty</p>'}</div>
    </div>
  \`;
}

async function renderMemory(el) {
  const entries = await api('/api/memory');
  el.innerHTML = \`<div class="card col-12"><h2>Memory (\${entries.length})</h2><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px; margin-top:20px">\${entries.map(e => \`<div class="list-item"><span class="badge">\${e.type}</span><b>\${e.name}</b></div>\`).join('')}</div></div>\`;
}

async function renderGraph(el) {
  const graph = await api('/api/graph');
  el.innerHTML = \`<div class="card col-12"><h2>Knowledge Graph (\${graph.metadata.nodeCount} nodes)</h2><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px; margin-top:20px">\${graph.nodes.slice(0, 100).map(n => \`<div class="list-item"><span class="badge">\${n.kind}</span><b>\${n.name}</b></div>\`).join('')}</div></div>\`;
}

async function renderDaemon(el) {
  const tasks = await api('/api/kairos/tasks');
  el.innerHTML = \`<div class="card col-12"><h2>Kairos Daemon Tasks</h2><div style="margin-top:20px">\${tasks.map(t => \`<div class="list-item"><span class="badge \${t.enabled?'complete':''}">\${t.enabled?'Enabled':'Disabled'}</span><b>\${t.name}</b><span style="color:var(--muted)">(\${t.intervalMs/1000}s)</span></div>\`).join('')}</div></div>\`;
}

async function renderAnalytics(el) {
  const analytics = await api('/api/analytics');
  const monthly = analytics.monthly || {};
  el.innerHTML = \`<div class="card col-12"><h2>Analytics</h2><div class="stat-grid"><div class="stat-box">Cost: \${monthly.formattedCost}</div><div class="stat-box">Sessions: \${monthly.totalSessions}</div></div></div>\`;
}

async function updateBuddy() {
  try {
    const buddy = await api('/api/buddy/status');
    document.getElementById('buddy-face').textContent = buddy.face;
    document.getElementById('buddy-face').style.borderColor = buddy.color;
    document.getElementById('buddy-face').style.color = buddy.color;
    document.getElementById('buddy-mood').textContent = buddy.mood;
    document.getElementById('buddy-msg').textContent = buddy.message;
  } catch(e) {}
}

async function init() { await render('overview'); await updateBuddy(); }
init();
setInterval(() => { if (currentTab === 'overview') render('overview'); }, 10000);
setInterval(updateBuddy, 10000);
</script>
</body>
</html>`;
}

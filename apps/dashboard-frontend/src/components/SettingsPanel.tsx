import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, ChevronDown, ChevronUp, Save, RefreshCw, CheckCircle } from 'lucide-react';

const SETTINGS_LEVELS = [
  { level: 1, name: 'Built-in Defaults', path: 'Package defaults', editable: false },
  { level: 2, name: 'User Settings', path: '~/.cowork/settings.json', editable: true },
  { level: 3, name: 'Project Settings', path: '.cowork/settings.json', editable: true },
  { level: 4, name: 'CLAUDE.md Directives', path: 'CLAUDE.md frontmatter', editable: true },
  { level: 5, name: 'Environment Variables', path: 'process.env.*', editable: true },
];

const HOOKS = [
  { event: 'PreToolUse', toolName: 'BashTool', command: 'security-check.sh "$TOOL_INPUT"', active: true },
  { event: 'PostToolUse', toolName: 'FileWriteTool', command: 'format-file.sh "$TOOL_OUTPUT"', active: true },
  { event: 'Stop', toolName: null, command: 'notify-telegram.sh "Session ended"', active: false },
];

const MCP_SERVERS = [
  { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'], active: true },
  { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], active: true },
  { name: 'neo4j', command: 'node', args: ['./mcp-servers/neo4j.js'], active: false },
];

const DEFAULT_SETTINGS_DISPLAY = {
  provider: { name: 'anthropic', model: 'claude-opus-4-5', maxTokens: 8096, temperature: 1.0 },
  permissions: { mode: 'default', sandboxEnabled: true, bashTimeoutSecs: 60 },
  memory: { maxIndexLines: 200, autoDreamEnabled: true, idleMinutes: 30, maxTranscripts: 7 },
  compaction: { threshold: 0.85, reserveBuffer: 4096, maxFailures: 3 },
  cache: { enabled: true, staticTtl: 3600, stickyLatch: true },
  kairos: { enabled: true, tickIntervalSecs: 30, quietHoursStart: 23, quietHoursEnd: 7 },
};

export default function SettingsPanel() {
  const [expanded, setExpanded] = useState<string | null>('provider');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeLevel, setActiveLevel] = useState(3);

  const save = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); }, 1200);
  };

  const toggle = (key: string) => setExpanded(e => e === key ? null : key);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings Chain</h1>
          <p className="text-sm text-gray-400 mt-1">5-level cascade: Defaults → User → Project → CLAUDE.md → Environment</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Settings cascade levels */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">5-Level Settings Cascade</h3>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-700" />
          <div className="space-y-3">
            {SETTINGS_LEVELS.map((level, i) => (
              <motion.div
                key={level.level}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => setActiveLevel(level.level)}
                className={`relative pl-10 cursor-pointer`}
              >
                <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 top-3 ${activeLevel === level.level ? 'bg-violet-500 border-violet-500' : 'bg-gray-800 border-gray-600'}`} />
                <div className={`p-4 rounded-xl border transition-all ${activeLevel === level.level ? 'border-violet-500/40 bg-violet-500/10' : 'border-gray-800 hover:border-gray-700 bg-gray-900/50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 font-mono mr-2">Level {level.level}</span>
                      <span className="text-sm font-semibold text-white">{level.name}</span>
                    </div>
                    <span className="text-xs font-mono text-gray-500">{level.path}</span>
                  </div>
                  {level.level === 5 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {['DEFAULT_PROVIDER', 'DEFAULT_MODEL', 'PERMISSION_MODE', 'KAIROS_ENABLED', 'AUTODREAM_ENABLED'].map(env => (
                        <span key={env} className="text-xs font-mono px-2 py-0.5 bg-gray-800 text-gray-400 rounded">{env}</span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Config sections */}
      <div className="space-y-3">
        {Object.entries(DEFAULT_SETTINGS_DISPLAY).map(([key, values]) => (
          <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(key)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Settings size={14} className="text-violet-400" />
                <span className="text-sm font-semibold text-white capitalize">{key}</span>
              </div>
              {expanded === key ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </button>
            {expanded === key && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="border-t border-gray-800">
                <div className="p-5 grid grid-cols-2 gap-4">
                  {Object.entries(values).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-xs text-gray-500 mb-1 font-mono">{k}</div>
                      {typeof v === 'boolean' ? (
                        <button className={`w-10 h-5 rounded-full transition-colors relative ${v ? 'bg-violet-500' : 'bg-gray-700'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${v ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      ) : typeof v === 'number' ? (
                        <input type="number" defaultValue={v} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-violet-500/60" />
                      ) : (
                        <input type="text" defaultValue={String(v)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 font-mono focus:outline-none focus:border-violet-500/60" />
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* Hooks */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Lifecycle Hooks</h3>
          <p className="text-xs text-gray-400 mt-0.5">PreToolUse · PostToolUse · Stop</p>
        </div>
        <div className="divide-y divide-gray-800/50">
          {HOOKS.map((hook, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hook.active ? 'bg-emerald-400' : 'bg-gray-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-violet-300">{hook.event}</span>
                  {hook.toolName && <span className="text-xs text-gray-500">→ {hook.toolName}</span>}
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{hook.command}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Servers */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">MCP Servers</h3>
          <p className="text-xs text-gray-400 mt-0.5">Treat as npm dependencies — vet, pin, monitor</p>
        </div>
        <div className="divide-y divide-gray-800/50">
          {MCP_SERVERS.map((srv) => (
            <div key={srv.name} className="px-5 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${srv.active ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-mono text-gray-200">{srv.name}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">{srv.command} {srv.args.join(' ')}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${srv.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-500'}`}>
                {srv.active ? 'connected' : 'disabled'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

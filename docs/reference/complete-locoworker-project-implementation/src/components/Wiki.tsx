import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Search, Plus, Network, ArrowRight, RefreshCw, CheckCircle } from 'lucide-react';
import { WIKI_NODES } from '../data/mockData';

const TYPE_COLORS: Record<string, string> = {
  system: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  feature: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  data: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  policy: 'border-red-500/40 bg-red-500/10 text-red-300',
  integration: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

const GRAPH_CONNECTIONS = [
  { from: 'Authentication Architecture', to: 'Security Permission Matrix', label: 'enforced_by' },
  { from: 'KAIROS Heartbeat Loop', to: 'AutoDream Memory Pipeline', label: 'triggers' },
  { from: 'AutoDream Memory Pipeline', to: 'Neo4j Graph Schema', label: 'writes_to' },
  { from: 'MiroFish Simulation Agents', to: 'Neo4j Graph Schema', label: 'queries' },
  { from: 'Composio Integration Hub', to: 'Discord Thread Isolation', label: 'extends' },
  { from: 'Security Permission Matrix', to: 'Discord Thread Isolation', label: 'governs' },
];

export default function Wiki() {
  const [query, setQuery] = useState('');
  const [ingestFile, setIngestFile] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestDone, setIngestDone] = useState(false);
  const [selectedNode, setSelectedNode] = useState<typeof WIKI_NODES[0] | null>(null);
  const [tab, setTab] = useState<'nodes' | 'graph' | 'ingest'>('nodes');
  const [lintResults, setLintResults] = useState<null | { stale: number; ok: number; orphaned: number }>(null);
  const [linting, setLinting] = useState(false);

  const runIngest = () => {
    if (!ingestFile.trim()) return;
    setIngesting(true);
    setIngestDone(false);
    setTimeout(() => { setIngesting(false); setIngestDone(true); }, 2800);
  };

  const runLint = () => {
    setLinting(true);
    setTimeout(() => {
      setLintResults({ stale: 2, ok: 6, orphaned: 0 });
      setLinting(false);
    }, 1500);
  };

  const filtered = WIKI_NODES.filter(n =>
    query === '' || n.title.toLowerCase().includes(query.toLowerCase()) || n.type.includes(query)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">LLMWiki Knowledge Graph</h1>
          <p className="text-sm text-gray-400 mt-1">Neo4j-backed knowledge base with auto-ingest, graph relationships, and /wiki-lint</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={runLint} disabled={linting} className="flex items-center gap-2 px-4 py-2 border border-gray-700 hover:border-gray-600 rounded-xl text-sm text-gray-300 font-medium transition-colors">
            {linting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {linting ? 'Linting...' : '/wiki-lint'}
          </button>
        </div>
      </div>

      {/* Lint results */}
      {lintResults && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-6 p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle size={14} /> {lintResults.ok} nodes healthy</div>
          <div className="flex items-center gap-2 text-sm text-amber-400">⚠ {lintResults.stale} stale nodes</div>
          <div className="flex items-center gap-2 text-sm text-gray-400">◈ {lintResults.orphaned} orphaned</div>
          <button className="ml-auto text-xs text-violet-400 hover:text-violet-300">Fix all →</button>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Nodes', value: '8,941', color: '#8b5cf6' },
          { label: 'Graph Edges', value: '23,412', color: '#3b82f6' },
          { label: 'Auto-Ingests', value: '147', color: '#10b981' },
          { label: 'Last Updated', value: '2h ago', color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['nodes', 'graph', 'ingest'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 hover:text-gray-200'}`}>
            {t === 'nodes' ? '📑 Nodes' : t === 'graph' ? '🕸 Graph View' : '📥 Ingest'}
          </button>
        ))}
      </div>

      {/* Nodes tab */}
      {tab === 'nodes' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search wiki nodes..." className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((node, i) => (
              <motion.button
                key={node.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
                className={`text-left p-4 rounded-xl border transition-all ${selectedNode?.id === node.id ? 'border-violet-500/40 bg-violet-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{node.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Updated {node.lastUpdated}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${TYPE_COLORS[node.type]}`}>{node.type}</span>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                  <Network size={10} />
                  <span>{node.connections} connections</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Graph tab */}
      {tab === 'graph' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Knowledge Graph Relationships</h3>
          <div className="space-y-3">
            {GRAPH_CONNECTIONS.map((conn, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                <div className="text-sm text-blue-300 font-medium flex-1 truncate">{conn.from}</div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ArrowRight size={14} className="text-gray-500" />
                  <span className="text-xs text-violet-400 font-mono px-2 py-0.5 bg-violet-500/10 rounded-full">{conn.label}</span>
                  <ArrowRight size={14} className="text-gray-500" />
                </div>
                <div className="text-sm text-emerald-300 font-medium flex-1 truncate text-right">{conn.to}</div>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-gray-800/50 border border-gray-700/50 rounded-xl text-xs text-gray-500 font-mono">
            Neo4j query: MATCH (a)-[r]-&gt;(b) RETURN a, r, b LIMIT 25
          </div>
        </div>
      )}

      {/* Ingest tab */}
      {tab === 'ingest' && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Ingest Document</h3>
            <div className="space-y-3">
              <input
                value={ingestFile}
                onChange={e => setIngestFile(e.target.value)}
                placeholder="docs/architecture.md or paste any file path..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/60"
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input type="checkbox" defaultChecked className="accent-violet-500" />
                  Build knowledge graph
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-400 ml-4">
                  <input type="checkbox" defaultChecked className="accent-violet-500" />
                  Extract entities
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-400 ml-4">
                  <input type="checkbox" className="accent-violet-500" />
                  Overwrite existing
                </label>
              </div>
              <button onClick={runIngest} disabled={ingesting || !ingestFile.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors">
                {ingesting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                {ingesting ? 'Ingesting...' : 'Start Ingest'}
              </button>
            </div>

            {ingestDone && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-2">
                  <CheckCircle size={14} /> Ingest complete
                </div>
                <div className="text-xs text-gray-400 space-y-1 font-mono">
                  <div>Nodes created: <span className="text-white">34</span></div>
                  <div>Edges added: <span className="text-white">67</span></div>
                  <div>Vectors indexed: <span className="text-white">34</span></div>
                  <div>Stale nodes refreshed: <span className="text-white">3</span></div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

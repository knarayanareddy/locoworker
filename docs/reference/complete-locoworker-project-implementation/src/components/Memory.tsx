import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Search, Moon, Clock, Layers, Database, Zap, RefreshCw } from 'lucide-react';
import { MEMORY_ENTRIES } from '../data/mockData';

const TYPE_COLORS: Record<string, string> = {
  episodic: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  semantic: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  procedural: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
};

const DREAM_LOG = [
  { time: '02:00:03', event: 'AutoDream started — 7 session transcripts queued' },
  { time: '02:00:08', event: 'Session "Auth Refactor" → 12 facts extracted' },
  { time: '02:00:19', event: 'Session "Security Audit" → 8 facts extracted, 2 contradictions resolved' },
  { time: '02:00:31', event: 'Session "Deploy Pipeline" → 6 facts extracted' },
  { time: '02:00:45', event: 'Deduplication pass: 4 redundant facts merged' },
  { time: '02:00:52', event: 'Graph relationships updated: 23 new edges in Neo4j' },
  { time: '02:01:04', event: 'Embedding index rebuilt: 1,847 vectors refreshed' },
  { time: '02:01:11', event: 'CLAUDE.md summary regenerated (200 lines)' },
  { time: '02:01:18', event: '✅ AutoDream complete — Memory index ready' },
];

const SEARCH_RESULTS = [
  { content: 'JWT tokens expire after 15 minutes; refresh via /auth/refresh endpoint', relevance: 0.96, type: 'semantic', source: 'Auth Refactor session' },
  { content: 'bcrypt cost factor 12 used for password hashing in UserService', relevance: 0.91, type: 'semantic', source: 'Security Audit session' },
  { content: 'SQL injection vulnerability patched in /users/search — use parameterized queries', relevance: 0.87, type: 'episodic', source: 'Security Audit #3' },
];

export default function Memory() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<typeof SEARCH_RESULTS>([]);
  const [searching, setSearching] = useState(false);
  const [dreamRunning, setDreamRunning] = useState(false);
  const [dreamLog, setDreamLog] = useState<typeof DREAM_LOG>([]);
  const [tab, setTab] = useState<'index' | 'search' | 'dream'>('index');
  const [stats, setStats] = useState({ facts: 1847, sessions: 7, edges: 8941 });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(s => ({ ...s, facts: s.facts + Math.floor(Math.random() * 3) }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setTimeout(() => {
      setResults(SEARCH_RESULTS);
      setSearching(false);
    }, 1200);
  };

  const runDream = () => {
    setDreamRunning(true);
    setDreamLog([]);
    setTab('dream');
    DREAM_LOG.forEach((entry, i) => {
      setTimeout(() => {
        setDreamLog(prev => [...prev, entry]);
        if (i === DREAM_LOG.length - 1) {
          setDreamRunning(false);
          setStats(s => ({ facts: s.facts + 26, sessions: s.sessions, edges: s.edges + 23 }));
        }
      }, i * 700);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AutoDream Memory</h1>
          <p className="text-sm text-gray-400 mt-1">Persistent memory system with nightly consolidation and RRF hybrid search</p>
        </div>
        <button
          onClick={runDream}
          disabled={dreamRunning}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors"
        >
          <Moon size={15} />
          {dreamRunning ? 'Dreaming...' : 'Run AutoDream'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Memory Facts', value: stats.facts.toLocaleString(), icon: Database, color: '#8b5cf6' },
          { label: 'Sessions Indexed', value: stats.sessions, icon: Layers, color: '#3b82f6' },
          { label: 'Graph Edges', value: stats.edges.toLocaleString(), icon: Brain, color: '#10b981' },
          { label: 'Next AutoDream', value: '02:00 UTC', icon: Moon, color: '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Icon size={18} style={{ color }} className="mb-2" />
            <div className="text-xl font-bold text-white font-mono">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['index', 'search', 'dream'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 hover:text-gray-200'}`}>
            {t === 'index' ? '📑 Memory Index' : t === 'search' ? '🔍 Semantic Search' : '🌙 Dream Log'}
          </button>
        ))}
      </div>

      {/* Memory Index */}
      {tab === 'index' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-xs font-mono text-gray-500 px-1">
            <span>CONTENT</span><span>TYPE</span><span>RELEVANCE</span>
          </div>
          {MEMORY_ENTRIES.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-gray-200">{entry.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <Clock size={10} />
                    <span className="font-mono">{entry.timestamp}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[entry.type]}`}>{entry.type}</span>
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-white">{(entry.relevance * 100).toFixed(0)}%</div>
                    <div className="w-20 bg-gray-800 rounded-full h-1 mt-1">
                      <div className="h-1 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${entry.relevance * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Semantic Search */}
      {tab === 'search' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Search memory with RRF hybrid retrieval..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/60"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium flex items-center gap-2"
            >
              {searching ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searching && (
            <div className="flex items-center gap-3 text-sm text-gray-400 py-4">
              <RefreshCw size={16} className="animate-spin text-violet-400" />
              Running RRF hybrid retrieval (BM25 + embeddings, k=60)...
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">Found {results.length} results via hybrid RRF search</div>
              {results.map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-gray-200">{r.content}</p>
                      <div className="text-xs text-gray-500 mt-2">Source: {r.source}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[r.type]}`}>{r.type}</span>
                      <span className="text-sm font-mono font-bold text-white">{(r.relevance * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dream Log */}
      {tab === 'dream' && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 font-mono">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-violet-400">
              <Moon size={16} />
              <span className="text-sm font-semibold">AutoDream Pipeline</span>
            </div>
            {dreamRunning && <span className="text-xs text-violet-400 animate-pulse">● RUNNING</span>}
          </div>
          <div className="space-y-2">
            {dreamLog.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-3 text-sm"
              >
                <span className="text-gray-600 flex-shrink-0">{entry.time}</span>
                <span className={`${entry.event.startsWith('✅') ? 'text-emerald-400' : 'text-gray-300'}`}>{entry.event}</span>
              </motion.div>
            ))}
            {dreamRunning && (
              <div className="flex gap-3 text-sm">
                <span className="text-gray-600 animate-pulse">processing...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

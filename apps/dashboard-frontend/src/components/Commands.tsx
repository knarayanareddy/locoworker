import { useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Search, Play, Zap } from 'lucide-react';
import { SLASH_COMMANDS } from '../data/mockData';

const STATUS_STYLE: Record<string, string> = {
  stable: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  rolling_out: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  unreleased: 'bg-red-500/15 text-red-400 border border-red-500/20',
  cowork_ext: 'bg-violet-500/15 text-violet-400 border border-violet-500/20',
};

const CATEGORIES = ['All', 'Memory', 'Git', 'Planning', 'Agents', 'Knowledge', 'Graph', 'Research', 'Simulation', 'Messaging', 'Diagnostics'];

const TERMINAL_DEMO: Record<string, string> = {
  '/compact': `> /compact
🔄 Compressing conversation context...
   Before: 48,200 tokens (74% of limit)
   Analyzing: 34 messages, 7 tool calls
   Strategy: Hierarchical summarization
   
   ✓ Tool calls collapsed to summaries
   ✓ User messages distilled
   ✓ Key decisions preserved in memory
   
   After: 12,800 tokens (20% of limit)
   Space freed: 35,400 tokens
   Memory index updated with 6 new facts
   
✅ Context compacted successfully`,

  '/commit-push-pr': `> /commit-push-pr
🔍 Analyzing changes...
   Modified: 3 files
   Added: 1 file
   Deleted: 0 files

📝 Generating commit message...
   feat(auth): implement JWT refresh token rotation
   
   - Add rotateRefreshToken() function
   - Update middleware to check 15min expiry
   - Add /auth/refresh endpoint
   - 14/14 tests passing

🚀 Pushing to origin/feature/jwt-refresh...
   Push complete ✓

🔀 Creating Pull Request...
   Title: feat(auth): JWT refresh token rotation
   Branch: feature/jwt-refresh → main
   Labels: security, auth
   Reviewers: @team-lead, @security-team
   
✅ PR #52 created: github.com/org/repo/pull/52`,

  '/autorun': `> /autorun --metric test_coverage --budget 2h --target 90%
🔬 AutoResearch Loop starting...
   Budget: 2 hours
   Target metric: test_coverage → 90%
   Current baseline: 0.781

Experiment #1: Increase test fixture reuse
   Hypothesis: Shared fixtures reduce duplication
   Running evaluator... score: 0.812 (+0.031) ✓ KEPT

Experiment #2: Add edge case tests for null inputs  
   Hypothesis: Null guards increase coverage
   Running evaluator... score: 0.847 (+0.035) ✓ KEPT

Experiment #3: Remove redundant mock setup
   Running evaluator... score: 0.831 (-0.016) ✗ REVERTED

Experiment #4: Add integration test for refresh flow
   Running evaluator... score: 0.891 (+0.044) ✓ KEPT

🎯 New best: 0.891 — Telegram notification sent
⏱ 47 minutes elapsed · 90% target not yet reached...`,

  '/simulate': `> /simulate --agents 500 --scenario "AI tool adoption in enterprise" --platforms twitter,reddit
🌐 MiroFish Simulation Studio
   Loading scenario: "AI tool adoption in enterprise"
   
📊 Graph Building...
   Extracting seed entities: 23 concepts found
   Injecting individual memories via Zep...
   Constructing GraphRAG in Neo4j... 8,941 edges
   
🤖 Generating 500 agents...
   TechOptimist personas: 142
   SkepticalDev personas: 89
   ProductManager personas: 103  
   OpenSourceAdvocate personas: 71
   StartupFounder personas: 95
   
▶ Simulation running (Day 1/30)...
   Platform A (Twitter): 1,247 posts, 4,891 reactions
   Platform B (Reddit): 234 threads, 12,091 upvotes
   Emergent behavior detected: viral adoption curve
   
📈 Day 7 update: Adoption sentiment +34%`,

  '/wiki-ingest': `> /wiki-ingest ./docs/architecture.md --graph
📚 LLMWiki Ingestion Pipeline
   File: docs/architecture.md (2,847 words)
   
🔍 Parsing structure...
   Headers: 12 sections identified
   Code blocks: 7 extracted
   Diagrams: 3 referenced
   
🔗 Building knowledge graph...
   Entities extracted: 34
   Relationships mapped: 67
   Connecting to existing nodes...
   
   New connections:
   AuthModule → JWTService (implements)
   JWTService → RefreshRotation (uses)
   RefreshRotation → SecurityAudit (requires)
   
✅ Ingested: 34 nodes, 67 edges added to LLMWiki
   Stale nodes updated: 3
   Wiki graph now has 8,941 total nodes`,
};

export default function Commands() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<typeof SLASH_COMMANDS[0] | null>(SLASH_COMMANDS[0]);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [running, setRunning] = useState(false);

  const filtered = SLASH_COMMANDS.filter(c =>
    (category === 'All' || c.category === category) &&
    (search === '' || c.name.includes(search) || c.desc.toLowerCase().includes(search.toLowerCase()))
  );

  const runCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
    setSelected(cmd);
    setRunning(true);
    setTerminalOutput('');
    const demo = TERMINAL_DEMO[cmd.name] || `> ${cmd.name}\n🔄 Executing ${cmd.name}...\n\n${cmd.desc}\n\n✅ Command completed successfully`;
    let i = 0;
    const chars = demo.split('');
    const interval = setInterval(() => {
      setTerminalOutput(prev => prev + chars[i]);
      i++;
      if (i >= chars.length) {
        clearInterval(interval);
        setRunning(false);
      }
    }, 12);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Slash Command Catalog</h1>
        <p className="text-sm text-gray-400 mt-1">87 commands across memory, git, agents, research, simulation and more</p>
      </div>

      {/* Search + Categories */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/60"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.slice(0, 6).map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${category === cat ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 hover:text-gray-200 border border-gray-800 hover:border-gray-700'}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 h-[calc(100vh-260px)]">
        {/* Command list */}
        <div className="col-span-2 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map((cmd, i) => (
            <motion.button
              key={cmd.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => { setSelected(cmd); setTerminalOutput(''); }}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                selected?.name === cmd.name
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-bold text-violet-300">{cmd.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[cmd.status]}`}>
                  {cmd.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 truncate">{cmd.desc}</p>
              <span className="text-xs text-gray-600">{cmd.category}</span>
            </motion.button>
          ))}
        </div>

        {/* Terminal preview */}
        <div className="col-span-3 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
              </div>
              <span className="text-xs text-gray-500 font-mono ml-2">CoWork Terminal</span>
            </div>
            {selected && (
              <button
                onClick={() => runCommand(selected)}
                disabled={running}
                className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors"
              >
                <Play size={12} />
                {running ? 'Running...' : `Run ${selected.name}`}
              </button>
            )}
          </div>

          {/* Terminal body */}
          <div className="flex-1 p-5 overflow-y-auto">
            {selected && !terminalOutput && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Terminal size={16} className="text-violet-400" />
                  <span className="font-mono text-violet-300 font-bold text-lg">{selected.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[selected.status]}`}>
                    {selected.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-gray-300 text-sm">{selected.desc}</p>
                <div className="border-t border-gray-800 pt-3">
                  <div className="text-xs text-gray-500 mb-2">Category</div>
                  <span className="text-sm text-blue-300 font-mono">{selected.category}</span>
                </div>
                <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-4 mt-4">
                  <div className="text-xs text-gray-500 mb-2 font-mono">Click "Run" to simulate execution</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Zap size={10} className="text-violet-500" />
                    <span>Live terminal simulation with real output</span>
                  </div>
                </div>
              </div>
            )}

            {terminalOutput && (
              <pre className="text-sm font-mono text-green-300 whitespace-pre-wrap leading-relaxed">
                {terminalOutput}
                {running && <span className="animate-pulse">▌</span>}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

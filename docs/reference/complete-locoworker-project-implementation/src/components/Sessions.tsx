import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, MessageSquare, Zap, Clock, ChevronRight, Send, X, RotateCcw, Archive } from 'lucide-react';
import { SESSIONS, AGENTS } from '../data/mockData';

const SAMPLE_CONVERSATION = [
  { role: 'user', content: 'Refactor the auth module to use JWT refresh token rotation with 15-minute expiry.' },
  { role: 'assistant', content: 'I\'ll analyze the current auth module and implement JWT refresh token rotation.\n\n**Plan:**\n1. Add `refreshToken` field to User model\n2. Create `/auth/refresh` endpoint\n3. Implement token rotation logic\n4. Update middleware to handle expiry\n\nLet me start by reading the current implementation...' },
  { role: 'tool', content: 'FileReadTool → src/auth/middleware.ts (284 lines read)' },
  { role: 'assistant', content: 'Found the current middleware. The existing `verifyToken()` function doesn\'t handle refresh. I\'ll now implement rotation:\n\n```typescript\nexport async function rotateRefreshToken(oldToken: string) {\n  const payload = verifyToken(oldToken);\n  await invalidateToken(oldToken); // Revoke old\n  return issueTokenPair(payload.userId);\n}\n```\n\nWriting to src/auth/refresh.ts...' },
  { role: 'tool', content: 'FileWriteTool → src/auth/refresh.ts (47 lines written)' },
  { role: 'tool', content: 'BashTool → npm test src/auth/ (14/14 tests passing ✓)' },
  { role: 'assistant', content: '✅ JWT refresh rotation implemented and all tests pass!\n\n**Changes made:**\n- `src/auth/refresh.ts` — New rotation logic\n- `src/auth/middleware.ts` — Updated to check expiry\n- `src/auth/routes.ts` — Added `/auth/refresh` endpoint\n\nWant me to run `/commit-push-pr` to ship this?' },
  { role: 'user', content: 'Yes, commit and push.' },
  { role: 'tool', content: 'GitTool → commit "feat(auth): implement JWT refresh token rotation with 15min expiry" → pushed → PR #52 created' },
  { role: 'assistant', content: '🚀 Done! PR #52 is open and ready for review. I\'ve tagged it with the security label since it modifies auth flow.' },
];

export default function Sessions() {
  const [selectedSession, setSelectedSession] = useState(SESSIONS[0]);
  const [messages, setMessages] = useState(SAMPLE_CONVERSATION);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'tool' as const,
        content: `FileReadTool → analyzing request context...`,
      }]);
    }, 800);

    setTimeout(() => {
      const responses = [
        `I'll handle that right away. Let me analyze the codebase and implement the requested changes.\n\n**Approach:**\n- Scanning relevant files\n- Identifying dependencies\n- Implementing with test coverage\n\nExecuting now...`,
        `Great question. Based on the current architecture, I recommend:\n\n1. Use the repository pattern for data access\n2. Add proper error boundaries\n3. Implement retry logic with exponential backoff\n\nShall I proceed with implementation?`,
        `I've completed the analysis. Here's what I found:\n\n- 3 files need updating\n- 2 new interfaces to create\n- Test coverage will increase from 78% → 94%\n\nReady to implement on your approval.`,
      ];
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: responses[Math.floor(Math.random() * responses.length)],
      }]);
      setIsTyping(false);
    }, 2200);
  };

  const filtered = SESSIONS.filter(s => filter === 'all' || s.status === filter);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Session List */}
      <div className="w-72 flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Agent Sessions</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage and inspect AI agent conversations</p>
        </div>

        {/* Filters */}
        <div className="flex gap-1">
          {(['all', 'active', 'archived'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${filter === f ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-500 hover:text-gray-300'}`}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Session list */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {filtered.map((s) => (
            <motion.button
              key={s.id}
              onClick={() => setSelectedSession(s)}
              whileHover={{ scale: 1.01 }}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedSession.id === s.id
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'active' ? 'bg-emerald-400 animate-pulse' : s.status === 'compacted' ? 'bg-amber-400' : 'bg-gray-600'}`} />
                <span className="text-xs text-gray-500 font-mono">{s.time}</span>
              </div>
              <div className="text-sm font-medium text-white truncate">{s.title}</div>
              <div className="text-xs text-gray-500 mt-1">{s.agent}</div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 font-mono">
                <span>{s.turns}t</span>
                <span>{(s.tokens / 1000).toFixed(1)}K tkns</span>
              </div>
            </motion.button>
          ))}
        </div>

        {/* New Session Button */}
        <button className="w-full py-2.5 rounded-xl border border-violet-500/40 text-violet-400 text-sm font-medium hover:bg-violet-500/10 transition-colors flex items-center justify-center gap-2">
          <MessageSquare size={14} />
          New Session
        </button>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
          <div>
            <h3 className="text-sm font-semibold text-white">{selectedSession.title}</h3>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 font-mono">
              <span className="flex items-center gap-1"><Brain size={10} /> {selectedSession.agent}</span>
              <span className="flex items-center gap-1"><Zap size={10} /> {selectedSession.provider}</span>
              <span className="flex items-center gap-1"><Clock size={10} /> {selectedSession.turns} turns</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors" title="Compact">
              <RotateCcw size={14} />
            </button>
            <button className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Archive">
              <Archive size={14} />
            </button>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${selectedSession.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
              {selectedSession.status}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              {msg.role === 'user' && (
                <div className="flex justify-end">
                  <div className="max-w-[75%] bg-violet-600/20 border border-violet-500/30 rounded-xl rounded-tr-sm px-4 py-3">
                    <p className="text-sm text-gray-200">{msg.content}</p>
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Brain size={12} className="text-blue-400" />
                  </div>
                  <div className="max-w-[78%] bg-gray-800 border border-gray-700/50 rounded-xl rounded-tl-sm px-4 py-3">
                    <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans">{msg.content}</pre>
                  </div>
                </div>
              )}
              {msg.role === 'tool' && (
                <div className="flex justify-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-full text-xs text-gray-400 font-mono">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {msg.content}
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Brain size={12} className="text-blue-400" />
              </div>
              <div className="bg-gray-800 border border-gray-700/50 rounded-xl px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-gray-400"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-gray-800">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Message agent... (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="h-11 w-11 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 font-mono">
            <span>Model: {selectedSession.provider}</span>
            <span>Context: 74%</span>
            <span className="ml-auto">Shift+Enter for newline</span>
          </div>
        </div>
      </div>
    </div>
  );
}

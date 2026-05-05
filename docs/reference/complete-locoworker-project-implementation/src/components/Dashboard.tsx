import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Zap, Brain, Activity, DollarSign, GitCommit, Shield, ArrowUpRight, TrendingUp } from 'lucide-react';
import { TOKEN_USAGE_DATA, AGENTS, SESSIONS } from '../data/mockData';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

const PROVIDER_PIE = [
  { name: 'claude-opus-4-5', value: 45, cost: 12.40 },
  { name: 'gpt-4o', value: 28, cost: 7.20 },
  { name: 'claude-sonnet-4-5', value: 15, cost: 2.10 },
  { name: 'deepseek-chat', value: 8, cost: 0.34 },
  { name: 'gemini-1.5-pro', value: 4, cost: 0.89 },
];

function StatCard({ title, value, sub, icon: Icon, color, trend }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900 border border-gray-800 rounded-xl p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center`} style={{ background: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <TrendingUp size={12} /> {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5 font-mono">{sub}</div>}
    </motion.div>
  );
}

export default function Dashboard() {
  const [liveTokens, setLiveTokens] = useState(94213);
  const [liveCost, setLiveCost] = useState(22.93);
  const [liveCommits, setLiveCommits] = useState(47);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveTokens(t => t + Math.floor(Math.random() * 120 + 20));
      setLiveCost(c => parseFloat((c + Math.random() * 0.03).toFixed(2)));
      if (Math.random() > 0.9) setLiveCommits(c => c + 1);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Command Center</h1>
        <p className="text-sm text-gray-400 mt-1">Real-time overview of all CoWork AI systems and agents</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Tokens Today" value={liveTokens.toLocaleString()} sub="↑ 12% vs yesterday" icon={Zap} color="#8b5cf6" trend="+12%" />
        <StatCard title="Active Agent Sessions" value={SESSIONS.filter(s => s.status === 'active').length} sub={`${AGENTS.filter(a => a.status === 'active').length} agents running`} icon={Brain} color="#3b82f6" />
        <StatCard title="Total Cost Today" value={`$${liveCost}`} sub="claude-opus-4-5 dominant" icon={DollarSign} color="#10b981" trend="-8%" />
        <StatCard title="Git Commits Today" value={liveCommits} sub="Via /commit-push-pr" icon={GitCommit} color="#f59e0b" trend="+3" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Token usage chart */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Token Usage — 24h</h3>
              <p className="text-xs text-gray-400">Input · Output · Cache hits</p>
            </div>
            <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full font-mono">LIVE</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={TOKEN_USAGE_DATA}>
              <defs>
                <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cacheGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" stroke="#4b5563" tick={{ fontSize: 10 }} />
              <YAxis stroke="#4b5563" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Area type="monotone" dataKey="input" stroke="#8b5cf6" fill="url(#inputGrad)" strokeWidth={2} name="Input" />
              <Area type="monotone" dataKey="output" stroke="#3b82f6" fill="url(#outputGrad)" strokeWidth={2} name="Output" />
              <Area type="monotone" dataKey="cache" stroke="#10b981" fill="url(#cacheGrad)" strokeWidth={2} name="Cache" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Provider breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Provider Split</h3>
          <p className="text-xs text-gray-400 mb-3">By token volume</p>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={PROVIDER_PIE} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value">
                {PROVIDER_PIE.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [`${v}%`, 'Share']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {PROVIDER_PIE.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                  <span className="text-gray-400 truncate max-w-[100px]">{p.name.split('-').slice(0,2).join('-')}</span>
                </div>
                <span className="text-gray-300 font-mono">${p.cost}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agents + Sessions */}
      <div className="grid grid-cols-2 gap-4">
        {/* Active Agents */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Active Agents</h3>
          <div className="space-y-3">
            {AGENTS.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: agent.color + '30', border: `1px solid ${agent.color}50` }}>
                  {agent.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{agent.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{agent.model}</div>
                </div>
                <div className="text-right">
                  <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${agent.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
                    {agent.status}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{agent.tasks} tasks</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Recent Sessions</h3>
          <div className="space-y-3">
            {SESSIONS.map((s) => (
              <div key={s.id} className="flex items-start gap-3 group cursor-pointer">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${s.status === 'active' ? 'bg-emerald-400 animate-pulse' : s.status === 'compacted' ? 'bg-amber-400' : 'bg-gray-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate group-hover:text-violet-300 transition-colors">{s.title}</div>
                  <div className="text-xs text-gray-500">{s.agent} · {s.turns} turns · {s.tokens.toLocaleString()} tokens</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-500">{s.time}</span>
                  <ArrowUpRight size={12} className="text-gray-600 group-hover:text-violet-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security + KAIROS quick status */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Security Status</h3>
          </div>
          <div className="text-3xl font-bold text-emerald-400 font-mono">7/8</div>
          <div className="text-xs text-gray-400 mt-1">Checks passing · 1 warning</div>
          <div className="mt-3 flex gap-1 flex-wrap">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-sm ${i === 2 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-violet-400" />
            <h3 className="text-sm font-semibold text-white">KAIROS</h3>
            <span className="ml-auto text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
          </div>
          <div className="text-3xl font-bold text-violet-400 font-mono">30s</div>
          <div className="text-xs text-gray-400 mt-1">Tick interval · 8 acts today</div>
          <div className="mt-3 text-xs text-gray-500 font-mono">Next: 14:23:31</div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Memory Index</h3>
          </div>
          <div className="text-3xl font-bold text-blue-400 font-mono">1,847</div>
          <div className="text-xs text-gray-400 mt-1">Indexed facts · AutoDream enabled</div>
          <div className="mt-3 text-xs text-gray-500 font-mono">Next dream: 02:00 UTC</div>
        </div>
      </div>
    </div>
  );
}

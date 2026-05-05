import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Network, Play, Pause, MessageSquare, Users, BarChart3, RefreshCw } from 'lucide-react';
import { SIMULATION_AGENTS } from '../data/mockData';

type SimAgent = typeof SIMULATION_AGENTS[0];

const SCENARIOS = [
  'AI tool adoption in enterprise',
  'Open source vs proprietary debate',
  'Remote work culture shift',
  'Web3 technology skepticism',
  'AI safety concerns among developers',
];

const EMERGENT_EVENTS = [
  { day: 3, event: 'TechOptimist cluster forms — viral adoption narrative', impact: 'high' },
  { day: 7, event: 'SkepticalDev counter-narrative: "Another hype cycle"', impact: 'medium' },
  { day: 12, event: 'ProductManager coalition shifts sentiment +18%', impact: 'high' },
  { day: 18, event: 'OpenSourceAdvocate raises privacy concerns — Reddit trending', impact: 'medium' },
  { day: 23, event: 'Tipping point: 63% adoption rate reached', impact: 'critical' },
];

export default function Simulation() {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [agentCount, setAgentCount] = useState(500);
  const [day, setDay] = useState(0);
  const [running, setRunning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SimAgent | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<{ role: string; content: string }[]>([]);
  const [events, setEvents] = useState<typeof EMERGENT_EVENTS>([]);
  const [twitterPosts, setTwitterPosts] = useState(0);
  const [redditThreads, setRedditThreads] = useState(0);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setDay(d => {
        if (d >= 30) { setRunning(false); return d; }
        const nextDay = d + 1;
        setTwitterPosts(p => p + Math.floor(Math.random() * 200 + 100));
        setRedditThreads(r => r + Math.floor(Math.random() * 30 + 10));
        const event = EMERGENT_EVENTS.find(e => e.day === nextDay);
        if (event) setEvents(prev => [...prev, event]);
        return nextDay;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [running]);

  const startSimulation = () => {
    setDay(0);
    setEvents([]);
    setTwitterPosts(0);
    setRedditThreads(0);
    setRunning(true);
  };

  const agentChat = () => {
    if (!chatInput.trim() || !selectedAgent) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatLog(prev => [...prev, userMsg]);
    setChatInput('');
    setTimeout(() => {
      const responses: Record<string, string> = {
        'TechOptimist_42': `As someone who's been using AI tools daily, I genuinely believe this wave is different. The productivity gains I've seen are real — 3x throughput on my team. ${scenario} is accelerating faster than any previous tech shift I've witnessed.`,
        'SkepticalDev_99': `Look, I've been a senior engineer for 15 years. Every 5 years there's a "this changes everything" moment. I'm not saying AI isn't powerful, but the hype around ${scenario} is way ahead of the reality. We still have massive reliability and trust issues.`,
        'ProductManager_X': `From a metrics standpoint, the data on ${scenario} is compelling. We've seen 40% reduction in time-to-market. That's real ROI. My board is asking why we haven't adopted it faster.`,
        'OpenSourceAdvocate': `My concern with ${scenario} is the proprietary lock-in. Who controls the weights? Who controls the data? We need open alternatives before we hand critical infrastructure to a handful of corporations.`,
        'StartupFounder_7': `Move fast or die. ${scenario} is the biggest competitive advantage right now. My competitors are already using it. This isn't optional anymore — it's table stakes.`,
        'AcademicResearcher': `The peer-reviewed evidence on ${scenario} is still emerging. We need longitudinal studies before drawing strong conclusions. The current discourse is dominated by anecdote, not rigorous empirical data.`,
      };
      setChatLog(prev => [...prev, { role: selectedAgent.name, content: responses[selectedAgent.name] || `As ${selectedAgent.persona}, my perspective on this is nuanced. The current evidence suggests we should proceed thoughtfully.` }]);
    }, 1000);
  };

  const getSentimentColor = (s: number) => s > 0.7 ? 'text-emerald-400' : s > 0.5 ? 'text-amber-400' : 'text-red-400';
  const getSentimentBg = (s: number) => s > 0.7 ? 'bg-emerald-400' : s > 0.5 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">MiroFish Simulation Studio</h1>
          <p className="text-sm text-gray-400 mt-1">Multi-agent social simulation with GraphRAG and emergent behavior detection</p>
        </div>
        <div className="flex items-center gap-3">
          {running && <span className="flex items-center gap-2 text-sm text-emerald-400 font-mono">Day {day}/30</span>}
          <button
            onClick={running ? () => setRunning(false) : startSimulation}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${running ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}
          >
            {running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Start Simulation</>}
          </button>
        </div>
      </div>

      {/* Config */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">Scenario</div>
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map(s => (
              <button key={s} onClick={() => setScenario(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${scenario === s ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">Agent Count: {agentCount}</div>
          <input type="range" min={50} max={1000} step={50} value={agentCount} onChange={e => setAgentCount(+e.target.value)} className="w-full accent-violet-500" />
          <div className="flex justify-between text-xs text-gray-600 mt-1"><span>50</span><span>1000</span></div>
        </div>
      </div>

      {/* Stats */}
      {day > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Simulation Day', value: `${day}/30`, icon: BarChart3, color: '#8b5cf6' },
            { label: 'Twitter Posts', value: twitterPosts.toLocaleString(), icon: Network, color: '#3b82f6' },
            { label: 'Reddit Threads', value: redditThreads.toLocaleString(), icon: MessageSquare, color: '#10b981' },
            { label: 'Active Agents', value: agentCount, icon: Users, color: '#f59e0b' },
          ].map(({ label, value, icon: Icon, color }) => (
            <motion.div key={label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <Icon size={16} style={{ color }} className="mb-1" />
              <div className="text-xl font-bold text-white font-mono">{value}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Agent roster */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Agent Roster</span>
            <span className="text-xs text-gray-500">{agentCount} total</span>
          </div>
          <div className="divide-y divide-gray-800/50">
            {SIMULATION_AGENTS.map((agent) => (
              <button
                key={agent.id}
                onClick={() => { setSelectedAgent(agent); setChatLog([]); }}
                className={`w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors ${selectedAgent?.id === agent.id ? 'bg-violet-500/10' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-mono font-medium text-white">{agent.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{agent.persona}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold font-mono ${getSentimentColor(agent.sentiment)}`}>
                      {(agent.sentiment * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-600">{agent.platform}</div>
                  </div>
                </div>
                <div className="mt-2 w-full bg-gray-800 rounded-full h-1">
                  <div className={`h-1 rounded-full ${getSentimentBg(agent.sentiment)}`} style={{ width: `${agent.sentiment * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat with agent / events */}
        <div className="space-y-3">
          {/* Emergent events */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Emergent Events</span>
              {running && <RefreshCw size={12} className="text-violet-400 animate-spin" />}
            </div>
            <div className="p-3 space-y-2 max-h-32 overflow-y-auto">
              {events.length === 0 ? (
                <div className="text-xs text-gray-600 py-2">Start simulation to see emergent behaviors...</div>
              ) : events.map((ev, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 text-xs">
                  <span className="text-gray-600 font-mono flex-shrink-0">Day {ev.day}</span>
                  <span className={`${ev.impact === 'critical' ? 'text-red-400' : ev.impact === 'high' ? 'text-amber-400' : 'text-gray-300'}`}>{ev.event}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Agent chat */}
          <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-semibold text-white">
                {selectedAgent ? `Chat with ${selectedAgent.name}` : 'Select an agent to chat'}
              </span>
            </div>
            <div className="p-3 space-y-2 min-h-[150px] max-h-[200px] overflow-y-auto">
              {chatLog.map((msg, i) => (
                <div key={i} className={`text-xs ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <span className={`font-medium text-gray-500 block mb-0.5`}>{msg.role === 'user' ? 'You' : msg.role}</span>
                  <span className={`inline-block px-3 py-2 rounded-lg text-gray-200 ${msg.role === 'user' ? 'bg-violet-600/20 border border-violet-500/30' : 'bg-gray-800'}`}>{msg.content}</span>
                </div>
              ))}
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <input
                disabled={!selectedAgent}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') agentChat(); }}
                placeholder={selectedAgent ? `Ask ${selectedAgent.name}...` : 'Select agent first'}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/60 disabled:opacity-50"
              />
              <button onClick={agentChat} disabled={!selectedAgent || !chatInput.trim()} className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 rounded-lg text-xs text-white">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

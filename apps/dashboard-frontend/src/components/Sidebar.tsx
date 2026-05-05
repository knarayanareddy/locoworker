import {
  Brain, Zap, GitBranch, Database, Shield, Terminal,
  MessageSquare, FlaskConical, Network, Settings, ChevronRight,
  Activity, BookOpen, Radio
} from 'lucide-react';

interface SidebarProps {
  activeSection: string;
  setActiveSection: (s: string) => void;
}

const NAV = [
  { id: 'dashboard', label: 'Command Center', icon: Activity, badge: null as string | number | null },
  { id: 'sessions', label: 'Agent Sessions', icon: Brain, badge: 5 as string | number | null },
  { id: 'commands', label: 'Slash Commands', icon: Terminal, badge: 87 as string | number | null },
  { id: 'memory', label: 'AutoDream Memory', icon: Database, badge: null as string | number | null },
  { id: 'kairos', label: 'KAIROS Loop', icon: Radio, badge: 'LIVE' as string | number | null },
  { id: 'research', label: 'AutoResearch', icon: FlaskConical, badge: null as string | number | null },
  { id: 'simulation', label: 'MiroFish Studio', icon: Network, badge: null as string | number | null },
  { id: 'wiki', label: 'LLMWiki Graph', icon: BookOpen, badge: null as string | number | null },
  { id: 'gateway', label: 'Msg Gateway', icon: MessageSquare, badge: 3 as string | number | null },
  { id: 'security', label: 'Security Audit', icon: Shield, badge: '1W' as string | number | null },
  { id: 'providers', label: 'AI Providers', icon: Zap, badge: null as string | number | null },
  { id: 'git', label: 'Git Workflow', icon: GitBranch, badge: null as string | number | null },
  { id: 'settings', label: 'Settings Chain', icon: Settings, badge: null as string | number | null },
];

export default function Sidebar({ activeSection, setActiveSection }: SidebarProps) {
  return (
    <aside className="w-64 min-h-screen flex flex-col bg-gray-950 border-r border-gray-800/60">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm tracking-tight">LocoWorker</div>
            <div className="text-xs text-gray-400 font-mono">CoWork v2.5.0</div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-5 py-3 border-b border-gray-800/40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">5 agents active · KAIROS running</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon, badge }) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group ${
                active
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
              }`}
            >
              <Icon size={16} className={active ? 'text-violet-400' : 'text-gray-500 group-hover:text-gray-300'} />
              <span className="flex-1 text-sm font-medium">{label}</span>
              {badge !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                  badge === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' :
                  badge === '1W' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {badge}
                </span>
              )}
              {active && <ChevronRight size={12} className="text-violet-400" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-800/60">
        <div className="text-xs text-gray-600 font-mono space-y-1">
          <div className="flex justify-between"><span>Context</span><span className="text-amber-400">74%</span></div>
          <div className="w-full bg-gray-800 rounded-full h-1">
            <div className="h-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: '74%' }} />
          </div>
          <div className="flex justify-between pt-0.5"><span>Tokens today</span><span className="text-blue-400">94.2K</span></div>
        </div>
      </div>
    </aside>
  );
}

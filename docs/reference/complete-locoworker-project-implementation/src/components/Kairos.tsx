import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Radio, Activity, Bell, Clock, Play, Pause, Settings } from 'lucide-react';
import { KAIROS_LOG } from '../data/mockData';

type LogEntry = { time: string; action: string; type: string };

export default function Kairos() {
  const [running, setRunning] = useState(true);
  const [nextTick, setNextTick] = useState(30);
  const [log, setLog] = useState<LogEntry[]>(KAIROS_LOG);
  const [actsToday, setActsToday] = useState(8);
  const [totalTicks, setTotalTicks] = useState(1247);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setNextTick(prev => {
        if (prev <= 1) {
          setTotalTicks(t => t + 1);
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
          const actions: LogEntry[] = [
            { time: timeStr, action: 'Quiet tick (no action needed)', type: 'quiet' },
            { time: timeStr, action: 'Checked GitHub — 1 new mention', type: 'act' },
            { time: timeStr, action: 'Quiet tick (no action needed)', type: 'quiet' },
            { time: timeStr, action: 'Memory snapshot taken', type: 'act' },
            { time: timeStr, action: 'Quiet tick (no action needed)', type: 'quiet' },
          ];
          const entry = actions[Math.floor(Math.random() * actions.length)];
          if (entry.type === 'act') setActsToday(a => a + 1);
          setLog(prev => [entry, ...prev.slice(0, 11)]);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const SCHEDULED_TASKS = [
    { cron: '0 2 * * *', task: 'autodream', desc: 'Memory consolidation', next: '02:00 UTC', status: 'scheduled' },
    { cron: '0 9 * * 1', task: 'wiki-lint', desc: 'Weekly wiki health check', next: 'Mon 09:00 UTC', status: 'scheduled' },
    { cron: '*/15 * * * *', task: 'check-messages', desc: 'Check Telegram/Discord', next: `${Math.floor(nextTick/60)}m ${nextTick%60}s`, status: 'running' },
    { cron: '0 0 * * *', task: 'daily-report', desc: 'Generate daily digest', next: '00:00 UTC', status: 'scheduled' },
  ];

  const WEBHOOK_EVENTS = [
    { event: 'pull_request', active: true, triggers: 47 },
    { event: 'issue_comment', active: true, triggers: 23 },
    { event: 'push', active: true, triggers: 91 },
    { event: 'release', active: false, triggers: 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">KAIROS Loop</h1>
          <p className="text-sm text-gray-400 mt-1">Persistent AI heartbeat — proactive agent that acts when it matters</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${running ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-gray-700 text-gray-400 border border-gray-700'}`}>
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            {running ? 'KAIROS ACTIVE' : 'PAUSED'}
          </span>
          <button
            onClick={() => setRunning(r => !r)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${running ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Next Tick', value: `${nextTick}s`, icon: Clock, color: '#8b5cf6', sub: '30s interval' },
          { label: 'Acts Today', value: actsToday, icon: Activity, color: '#10b981', sub: `${totalTicks} total ticks` },
          { label: 'Webhook Events', value: '161', icon: Radio, color: '#3b82f6', sub: 'Since last restart' },
          { label: 'Notifications', value: '23', icon: Bell, color: '#f59e0b', sub: 'Via Telegram/Discord' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Icon size={16} style={{ color }} className="mb-2" />
            <div className="text-2xl font-bold text-white font-mono">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
            <div className="text-xs text-gray-600 mt-0.5 font-mono">{sub}</div>
          </div>
        ))}
      </div>

      {/* Tick progress */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-violet-400" />
            <span className="text-sm font-semibold text-white">Heartbeat</span>
            <span className="text-xs text-gray-500 font-mono">Tick #{totalTicks}</span>
          </div>
          <span className="text-sm font-mono text-violet-400">{nextTick}s until next tick</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <motion.div
            className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
            animate={{ width: `${((30 - nextTick) / 30) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-600 font-mono mt-1">
          <span>Last tick</span>
          <span>Next: {nextTick}s</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Live log */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white font-mono">Activity Log</span>
            {running && <span className="text-xs text-emerald-400 animate-pulse">● LIVE</span>}
          </div>
          <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
            {log.map((entry, i) => (
              <motion.div
                key={i}
                initial={i === 0 ? { opacity: 0, y: -5 } : {}}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 text-xs font-mono"
              >
                <span className="text-gray-600 flex-shrink-0">{entry.time}</span>
                <span className={`${entry.type === 'act' ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {entry.type === 'act' ? '▶' : '·'} {entry.action}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Scheduled tasks */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Scheduled Tasks</span>
          </div>
          <div className="p-4 space-y-3">
            {SCHEDULED_TASKS.map((task) => (
              <div key={task.task} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${task.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-violet-300">{task.task}</span>
                    <span className="text-xs text-gray-500">{task.next}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{task.desc}</div>
                  <div className="text-xs text-gray-700 font-mono">{task.cron}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GitHub Webhook Events */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-gray-300" />
          <h3 className="text-sm font-semibold text-white">GitHub Webhook Subscriptions</h3>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {WEBHOOK_EVENTS.map((wh) => (
            <div key={wh.event} className={`p-3 rounded-xl border ${wh.active ? 'border-blue-500/30 bg-blue-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <div className={`text-xs font-mono font-bold ${wh.active ? 'text-blue-300' : 'text-gray-500'}`}>{wh.event}</div>
              <div className="text-lg font-bold text-white font-mono mt-1">{wh.triggers}</div>
              <div className="text-xs text-gray-500">{wh.active ? 'Active' : 'Disabled'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-white">Quiet Hours Configuration</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
            </div>
            <div className="relative w-full h-8 bg-gray-800 rounded-lg overflow-hidden">
              <div className="absolute inset-y-0 left-[29%] right-[4%] bg-emerald-500/30 border-l border-r border-emerald-500/50" />
              <div className="absolute inset-y-0 left-0 w-[29%] bg-amber-500/20" />
              <div className="absolute inset-y-0 right-0 w-[4%] bg-amber-500/20" />
              <div className="absolute inset-0 flex items-center px-3">
                <span className="text-xs text-amber-400 font-mono">23:00 – 07:00 quiet</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

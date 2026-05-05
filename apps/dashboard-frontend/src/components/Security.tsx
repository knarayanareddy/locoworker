import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle, Lock, Eye, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { SECURITY_CHECKS } from '../data/mockData';

const PERMISSION_LEVELS = [
  { level: 0, name: 'READ_ONLY', desc: 'Read files/info only — no writes, no bash', color: '#10b981' },
  { level: 1, name: 'CONSTRAINED', desc: 'File writes in project scope only — no bash', color: '#3b82f6' },
  { level: 2, name: 'STANDARD', desc: 'Shell + file + git (default)', color: '#8b5cf6' },
  { level: 3, name: 'ELEVATED', desc: 'All tools, some external access', color: '#f59e0b' },
  { level: 4, name: 'FULL', desc: 'All tools, system access, messaging', color: '#ef4444' },
  { level: 5, name: 'DANGEROUS', desc: 'dangerouslyDisableSandbox — never in production', color: '#991b1b' },
];

const BASH_BLOCKED = ['rm -rf', 'sudo', 'mkfs', 'dd', 'shutdown', 'reboot'];
const BASH_ALLOWED = ['git commit', 'git push', 'npm run', 'docker ps', 'curl -s'];

export default function Security() {
  const [currentLevel, setCurrentLevel] = useState(2);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState(SECURITY_CHECKS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sandboxEnabled, setSandboxEnabled] = useState(true);

  const runAudit = () => {
    setScanning(true);
    setTimeout(() => {
      setScanResults(SECURITY_CHECKS.map(c => ({
        ...c,
        status: c.severity === null ? 'pass' : Math.random() > 0.3 ? c.status : 'pass',
      })));
      setScanning(false);
    }, 2000);
  };

  const passing = scanResults.filter(c => c.status === 'pass').length;
  const warnings = scanResults.filter(c => c.status === 'warn').length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Audit</h1>
          <p className="text-sm text-gray-400 mt-1">6-level permission model, bash security, MCP integrity, and pre-session audit</p>
        </div>
        <button onClick={runAudit} disabled={scanning} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors">
          {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />}
          {scanning ? 'Scanning...' : 'Run Pre-Session Audit'}
        </button>
      </div>

      {/* Score */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 col-span-1">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-16 h-16 rounded-full border-4 ${passing === scanResults.length ? 'border-emerald-400' : warnings > 0 ? 'border-amber-400' : 'border-red-400'} flex items-center justify-center`}>
              <span className="text-2xl font-bold text-white">{passing}/{scanResults.length}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Security Score</div>
              <div className={`text-sm ${warnings > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {warnings} warning{warnings !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 col-span-1">
          <div className="text-xs text-gray-500 mb-2">Sandbox</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">{sandboxEnabled ? 'Enabled' : 'DISABLED'}</div>
              <div className="text-xs text-gray-400 mt-0.5">Process isolation active</div>
            </div>
            <button onClick={() => setSandboxEnabled(s => !s)} className={`w-12 h-6 rounded-full transition-colors relative ${sandboxEnabled ? 'bg-emerald-500' : 'bg-red-500'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${sandboxEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 col-span-1">
          <div className="text-xs text-gray-500 mb-2">Session Timeout</div>
          <div className="text-lg font-bold text-white">60 min</div>
          <div className="text-xs text-gray-400 mt-0.5">Reduce for sensitive work</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Permission levels */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Permission Levels</h3>
            <p className="text-xs text-gray-400">Current: Level {currentLevel} — {PERMISSION_LEVELS[currentLevel].name}</p>
          </div>
          <div className="divide-y divide-gray-800/50">
            {PERMISSION_LEVELS.map((level) => (
              <button
                key={level.level}
                onClick={() => setCurrentLevel(level.level)}
                className={`w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors ${currentLevel === level.level ? 'bg-gray-800/40' : ''}`}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white font-mono flex-shrink-0" style={{ background: level.color + '40', border: `1px solid ${level.color}60` }}>
                  {level.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono font-semibold" style={{ color: level.color }}>{level.name}</div>
                  <div className="text-xs text-gray-500 truncate">{level.desc}</div>
                </div>
                {currentLevel === level.level && <Lock size={12} className="text-white flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Audit checks */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Pre-Session Audit Checks</h3>
            {scanning && <RefreshCw size={12} className="text-violet-400 animate-spin" />}
          </div>
          <div className="divide-y divide-gray-800/50">
            {scanResults.map((check) => (
              <motion.div key={check.check} layout className="px-5 py-3">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(expanded === check.check ? null : check.check)}>
                  {check.status === 'pass' ? (
                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                  )}
                  <span className="text-sm text-gray-200 flex-1">{check.check}</span>
                  {check.severity && (
                    <span className="text-xs px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-full border border-amber-500/20">{check.severity}</span>
                  )}
                  {expanded === check.check ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
                </div>
                {expanded === check.check && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="mt-2 pl-7 text-xs text-gray-400">
                    {check.status === 'pass' ? 'All checks passed — no issues detected.' : `Warning: ${check.severity} severity issue detected. Recommendation: Scope to specific commands rather than using wildcards.`}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Bash rules */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <h3 className="text-sm font-semibold text-white">Blocked Commands</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {BASH_BLOCKED.map(cmd => (
              <span key={cmd} className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-xs font-mono">{cmd}</span>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Allowed Commands</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {BASH_ALLOWED.map(cmd => (
              <span key={cmd} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs font-mono">{cmd}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Security rules */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={14} className="text-red-400" />
          <h3 className="text-sm font-semibold text-white">Critical Security Rules</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            'Audit CLAUDE.md files in repos you clone, especially PRs and forks',
            'Treat MCP servers as npm dependencies — vet, pin, and monitor for changes',
            'Avoid broad bash permission rules like Bash(git:*)',
            'Monitor ~/.claude/ for unexpected config changes',
            'Pin your Claude Code version and verify binary hashes',
            'Never use dangerouslyDisableSandbox in shared or production environments',
            'Limit session length for sensitive work to reduce compaction attack window',
            'Use the official installer rather than npm where possible',
          ].map((rule, i) => (
            <div key={i} className="flex gap-2 text-xs text-gray-400 p-3 bg-gray-800/50 rounded-lg">
              <Shield size={12} className="text-violet-400 flex-shrink-0 mt-0.5" />
              {rule}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

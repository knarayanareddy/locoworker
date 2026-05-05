import { useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Play, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { RESEARCH_EXPERIMENTS } from '../data/mockData';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Exp = typeof RESEARCH_EXPERIMENTS[0];

const METRICS = [
  { id: 'test_coverage', label: 'Test Coverage', unit: '%', baseline: 78.1, target: 90 },
  { id: 'api_latency', label: 'API Latency', unit: 'ms', baseline: 245, target: 100 },
  { id: 'content_quality', label: 'Content Quality', unit: 'score', baseline: 0.71, target: 0.90 },
  { id: 'memory_recall', label: 'Memory Recall', unit: 'score', baseline: 0.781, target: 0.92 },
];

export default function Research() {
  const [experiments, setExperiments] = useState(RESEARCH_EXPERIMENTS);
  const [running, setRunning] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(METRICS[3]);
  const [budget, setBudget] = useState('2h');
  const [currentScore, setCurrentScore] = useState(0.891);
  const [expCount, setExpCount] = useState(6);
  const [progressData, setProgressData] = useState([
    { exp: 1, score: 0.816 },
    { exp: 2, score: 0.791 },
    { exp: 3, score: 0.847 },
    { exp: 4, score: 0.863 },
    { exp: 5, score: 0.831 },
    { exp: 6, score: 0.891 },
  ]);

  const startAutoRun = () => {
    setRunning(true);
    let i = 0;
    const newExps: Exp[] = [
      { id: expCount + 1, hypothesis: 'Add metadata filters for temporal recency', score: 0.904, status: 'running', delta: '+0.013' },
    ];

    const interval = setInterval(() => {
      i++;
      if (i === 1) {
        setExperiments(prev => [...prev.filter(e => e.status !== 'running'), { ...newExps[0], status: 'running' }]);
      }
      if (i === 4) {
        const score = 0.904 + (Math.random() - 0.4) * 0.05;
        const accepted = score > currentScore;
        const finalExp: Exp = {
          id: expCount + 1,
          hypothesis: newExps[0].hypothesis,
          score: parseFloat(score.toFixed(3)),
          status: accepted ? 'accepted' : 'rejected',
          delta: `${accepted ? '+' : ''}${(score - currentScore).toFixed(3)}`,
        };
        setExperiments(prev => [...prev.filter(e => e.status !== 'running'), finalExp]);
        if (accepted) {
          setCurrentScore(score);
          setProgressData(prev => [...prev, { exp: expCount + 1, score: parseFloat(score.toFixed(3)) }]);
        }
        setExpCount(c => c + 1);
        clearInterval(interval);
        setRunning(false);
      }
    }, 1200);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AutoResearch Loop</h1>
          <p className="text-sm text-gray-400 mt-1">Automated experiment runner with measurable metrics and clean git revert</p>
        </div>
        <button
          onClick={startAutoRun}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors"
        >
          {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Running Experiment...' : 'Run Next Experiment'}
        </button>
      </div>

      {/* Config */}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">Metric</div>
          <div className="grid grid-cols-2 gap-2">
            {METRICS.map(m => (
              <button key={m.id} onClick={() => setSelectedMetric(m)} className={`text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedMetric.id === m.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">Budget</div>
          <div className="space-y-1">
            {['1h', '2h', '4h', '8h'].map(b => (
              <button key={b} onClick={() => setBudget(b)} className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-mono transition-colors ${budget === b ? 'bg-violet-500/20 text-violet-300' : 'text-gray-400 hover:text-gray-200'}`}>{b}</button>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">Current Best</div>
          <div className="text-3xl font-bold text-white font-mono">{currentScore.toFixed(3)}</div>
          <div className="text-xs text-gray-400 mt-1">{selectedMetric.label}</div>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Baseline: {selectedMetric.baseline}</span>
              <span>Target: {selectedMetric.target}</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500"
                style={{ width: `${Math.min(100, ((currentScore - selectedMetric.baseline) / (selectedMetric.target - selectedMetric.baseline)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Score progression chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Score Progression</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="exp" stroke="#4b5563" tick={{ fontSize: 10 }} label={{ value: 'Experiment', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#6b7280' }} />
              <YAxis domain={[0.75, 0.95]} stroke="#4b5563" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Experiments table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Experiment Journal</h3>
          </div>
          <div className="overflow-y-auto max-h-[260px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-2 text-left text-gray-500">#</th>
                  <th className="px-4 py-2 text-left text-gray-500">Hypothesis</th>
                  <th className="px-4 py-2 text-right text-gray-500">Score</th>
                  <th className="px-4 py-2 text-right text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp) => (
                  <motion.tr
                    key={exp.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-2.5 text-gray-500 font-mono">{exp.id}</td>
                    <td className="px-4 py-2.5 text-gray-300 max-w-[160px] truncate">{exp.hypothesis}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white">{exp.score.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {exp.status === 'running' ? (
                        <span className="flex items-center justify-end gap-1 text-amber-400">
                          <RefreshCw size={10} className="animate-spin" /> running
                        </span>
                      ) : exp.status === 'accepted' ? (
                        <span className="flex items-center justify-end gap-1 text-emerald-400">
                          <CheckCircle size={10} /> {exp.delta}
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-1 text-red-400">
                          <XCircle size={10} /> {exp.delta}
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Three-component contract */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical size={16} className="text-violet-400" />
          <h3 className="text-sm font-semibold text-white">The Three-File Contract (Karpathy Pattern)</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { file: 'research/program.md', role: 'Human-authored direction', desc: 'Defines the research goal, constraints, and evaluation criteria. Read-only to the agent.', color: 'blue' as const },
            { file: 'research/experiment.ts', role: 'Agent-modifiable implementation', desc: 'The file the agent can modify to run experiments. Reverted on failure via git.', color: 'violet' as const },
            { file: 'eval/evaluator.ts', role: 'Immutable eval function', desc: 'The unchangeable scoring function. Determines keep/revert after each experiment.', color: 'emerald' as const },
          ].map(({ file, role, desc, color }) => (
            <div key={file} className={`p-4 rounded-xl border border-${color}-500/20 bg-${color}-500/5`}>
              <div className={`text-xs font-mono text-${color}-400 mb-1`}>{file}</div>
              <div className="text-sm font-semibold text-white mb-2">{role}</div>
              <div className="text-xs text-gray-400">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

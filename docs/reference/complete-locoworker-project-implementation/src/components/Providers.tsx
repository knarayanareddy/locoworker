import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, CheckCircle, Circle, DollarSign, Settings } from 'lucide-react';

const PROVIDERS = [
  {
    name: 'anthropic', label: 'Anthropic', models: [
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
      { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
    ], color: '#f59e0b', connected: true,
  },
  {
    name: 'openai', label: 'OpenAI', models: [
      { id: 'gpt-4o', name: 'GPT-4o', input: 5.00, output: 15.00 },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', input: 0.15, output: 0.60 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', input: 10.00, output: 30.00 },
    ], color: '#10b981', connected: true,
  },
  {
    name: 'deepseek', label: 'DeepSeek', models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', input: 0.14, output: 0.28 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', input: 0.55, output: 2.19 },
    ], color: '#3b82f6', connected: true,
  },
  {
    name: 'gemini', label: 'Google Gemini', models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', input: 1.25, output: 5.00 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', input: 0.075, output: 0.30 },
    ], color: '#8b5cf6', connected: true,
  },
  {
    name: 'ollama', label: 'Ollama (Local)', models: [
      { id: 'qwen2.5:32b', name: 'Qwen 2.5 32B', input: 0, output: 0 },
      { id: 'llama3.3:70b', name: 'LLaMA 3.3 70B', input: 0, output: 0 },
    ], color: '#6b7280', connected: false,
  },
];

const FALLBACK_STRATEGIES = [
  { id: 'primary-first', label: 'Primary First', desc: 'Always try primary, fallback only on error' },
  { id: 'cost-optimized', label: 'Cost Optimized', desc: 'Route to cheapest available model' },
  { id: 'round-robin', label: 'Round Robin', desc: 'Distribute load evenly across providers' },
  { id: 'latency-based', label: 'Latency Based', desc: 'Choose lowest latency provider' },
];

export default function Providers() {
  const [activeProvider, setActiveProvider] = useState('anthropic');
  const [activeModel, setActiveModel] = useState('claude-opus-4-5');
  const [fallbackProvider, setFallbackProvider] = useState('openai');
  const [fallbackStrategy, setFallbackStrategy] = useState('primary-first');
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(8096);

  const provider = PROVIDERS.find(p => p.name === activeProvider)!;
  const model = provider.models.find(m => m.id === activeModel) || provider.models[0];

  const estimateCost = (inputK: number, outputK: number) => {
    const input = (inputK / 1000) * (model.input || 0);
    const output = (outputK / 1000) * (model.output || 0);
    return (input + output).toFixed(4);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Provider Configuration</h1>
        <p className="text-sm text-gray-400 mt-1">Multi-provider routing with 5-level settings cascade and cost estimation</p>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-5 gap-3">
        {PROVIDERS.map((p) => (
          <motion.button
            key={p.name}
            whileHover={{ scale: 1.02 }}
            onClick={() => { setActiveProvider(p.name); setActiveModel(p.models[0].id); }}
            className={`p-4 rounded-xl border text-left transition-all ${activeProvider === p.name ? 'border-violet-500/40 bg-violet-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg" style={{ background: p.color + '30' }}>
                <div className="w-full h-full flex items-center justify-center text-xs font-bold font-mono" style={{ color: p.color }}>
                  {p.label[0]}
                </div>
              </div>
              {p.connected ? <CheckCircle size={12} className="text-emerald-400" /> : <Circle size={12} className="text-gray-600" />}
            </div>
            <div className="text-sm font-semibold text-white">{p.label}</div>
            <div className="text-xs text-gray-500">{p.models.length} models</div>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Model selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Model</h3>
          <div className="space-y-2">
            {provider.models.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveModel(m.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${activeModel === m.id ? 'border-violet-500/40 bg-violet-500/10' : 'border-gray-700 hover:border-gray-600'}`}
              >
                <div className="text-sm font-medium text-white">{m.name}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  ${m.input}/M in · ${m.output}/M out
                  {'cacheRead' in m && ` · ${'cacheRead' in m ? (m as any).cacheRead : 0}/M cache`}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Parameters</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Temperature</span>
                <span className="font-mono text-white">{temperature.toFixed(1)}</span>
              </div>
              <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={e => setTemperature(+e.target.value)} className="w-full accent-violet-500" />
              <div className="flex justify-between text-xs text-gray-600 mt-1"><span>Precise</span><span>Creative</span></div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Max Tokens</span>
                <span className="font-mono text-white">{maxTokens.toLocaleString()}</span>
              </div>
              <input type="range" min={1024} max={200000} step={1024} value={maxTokens} onChange={e => setMaxTokens(+e.target.value)} className="w-full accent-violet-500" />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-2">Base URL</div>
              <input defaultValue={provider.name === 'ollama' ? 'http://localhost:11434' : `https://api.${provider.name}.com`} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-violet-500/60" />
            </div>
          </div>
        </div>

        {/* Cost estimator */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={14} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Cost Estimator</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: '10K in / 2K out', input: 10, output: 2 },
              { label: '100K in / 20K out', input: 100, output: 20 },
              { label: '1M in / 200K out', input: 1000, output: 200 },
            ].map(({ label, input, output }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-gray-800">
                <span className="text-xs text-gray-400">{label}</span>
                <span className="text-sm font-mono text-white">${estimateCost(input, output)}</span>
              </div>
            ))}
            <div className="pt-2">
              <div className="text-xs text-gray-500 mb-1">Today's actual spend</div>
              <div className="text-2xl font-bold text-emerald-400 font-mono">$22.93</div>
            </div>
          </div>
        </div>
      </div>

      {/* Fallback config */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-white">Fallback Provider Strategy</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-2">Fallback Provider</div>
            <div className="flex gap-2 flex-wrap">
              {PROVIDERS.filter(p => p.name !== activeProvider && p.connected).map(p => (
                <button key={p.name} onClick={() => setFallbackProvider(p.name)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${fallbackProvider === p.name ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-2">Routing Strategy</div>
            <div className="flex gap-2 flex-wrap">
              {FALLBACK_STRATEGIES.map(s => (
                <button key={s.id} onClick={() => setFallbackStrategy(s.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${fallbackStrategy === s.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 bg-gray-800 border border-gray-700'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Provider cost comparison */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Full Provider Cost Matrix (per 1M tokens)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-gray-500">Model</th>
                <th className="text-right py-2 px-3 text-gray-500">Input</th>
                <th className="text-right py-2 px-3 text-gray-500">Output</th>
                <th className="text-right py-2 px-3 text-gray-500">Cache Read</th>
                <th className="text-right py-2 px-3 text-gray-500">Cache Write</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.flatMap(p => p.models).map(m => (
                <tr key={m.id} className={`border-b border-gray-800/50 ${activeModel === m.id ? 'bg-violet-500/5' : 'hover:bg-gray-800/30'}`}>
                  <td className="py-2 px-3 font-mono text-gray-300">{m.id}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-mono">${m.input.toFixed(3)}</td>
                  <td className="py-2 px-3 text-right text-amber-400 font-mono">${m.output.toFixed(3)}</td>
                  <td className="py-2 px-3 text-right text-blue-400 font-mono">{'cacheRead' in m ? `$${(m as any).cacheRead.toFixed(3)}` : '—'}</td>
                  <td className="py-2 px-3 text-right text-violet-400 font-mono">{'cacheWrite' in m ? `$${(m as any).cacheWrite.toFixed(3)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

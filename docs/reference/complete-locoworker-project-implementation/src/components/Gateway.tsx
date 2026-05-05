import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, CheckCircle, XCircle, Zap, RefreshCw } from 'lucide-react';
import { GATEWAY_CHANNELS } from '../data/mockData';

const COMPOSIO_APPS = [
  'github', 'jira', 'linear', 'notion', 'slack', 'discord', 'gmail', 'calendar',
  'sheets', 'docs', 'salesforce', 'stripe', 'twilio', 'sendgrid', 'hubspot', 'zendesk',
  'figma', 'asana', 'trello', 'confluence', 'pagerduty', 'datadog', 'vercel', 'aws',
];

const DISCORD_THREADS = [
  { id: 't1', name: '#dev-ops', messages: 47, sessionId: 'sess_abc123', isolated: true, status: 'active' },
  { id: 't2', name: '#security', messages: 12, sessionId: 'sess_def456', isolated: true, status: 'active' },
  { id: 't3', name: '#general', messages: 234, sessionId: null, isolated: false, status: 'shared' },
  { id: 't4', name: '#architecture', messages: 89, sessionId: 'sess_ghi789', isolated: true, status: 'archived' },
];

export default function Gateway() {
  const [notifMsg, setNotifMsg] = useState('');
  const [notifChannel, setNotifChannel] = useState('telegram');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [composioSearch, setComposioSearch] = useState('');

  const sendNotification = () => {
    if (!notifMsg.trim()) return;
    setSending(true);
    setSent(false);
    setTimeout(() => { setSending(false); setSent(true); setNotifMsg(''); setTimeout(() => setSent(false), 3000); }, 1500);
  };

  const filteredApps = COMPOSIO_APPS.filter(a => composioSearch === '' || a.includes(composioSearch.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Messaging Gateway</h1>
        <p className="text-sm text-gray-400 mt-1">Multi-channel message routing with Discord thread isolation and 500+ Composio integrations</p>
      </div>

      {/* Channels */}
      <div className="grid grid-cols-4 gap-3">
        {GATEWAY_CHANNELS.map((ch) => (
          <motion.div key={ch.id} whileHover={{ scale: 1.02 }} className={`p-4 rounded-xl border ${ch.status === 'connected' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-700 bg-gray-900'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{ch.icon}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ch.status === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-500'}`}>
                {ch.status}
              </span>
            </div>
            <div className="text-sm font-semibold text-white">{ch.name}</div>
            <div className="text-xs text-gray-500 mt-1 font-mono">{ch.messages.toLocaleString()} msgs · {ch.latency}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Send Notification */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Send size={14} className="text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Send Notification</h3>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              {GATEWAY_CHANNELS.filter(c => c.status === 'connected').map(c => (
                <button key={c.id} onClick={() => setNotifChannel(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${notifChannel === c.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-gray-400 bg-gray-800 border border-gray-700 hover:text-gray-200'}`}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
            <textarea
              value={notifMsg}
              onChange={e => setNotifMsg(e.target.value)}
              placeholder="Notification message..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60"
            />
            <button
              onClick={sendNotification}
              disabled={sending || !notifMsg.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium w-full justify-center transition-colors"
            >
              {sending ? <RefreshCw size={14} className="animate-spin" /> : sent ? <CheckCircle size={14} /> : <Send size={14} />}
              {sending ? 'Sending...' : sent ? 'Sent!' : `Send via ${GATEWAY_CHANNELS.find(c => c.id === notifChannel)?.name}`}
            </button>
          </div>
        </div>

        {/* Discord Thread Isolation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
            <span className="text-2xl">🎮</span>
            <div>
              <h3 className="text-sm font-semibold text-white">Discord Thread Isolation</h3>
              <p className="text-xs text-gray-400">Each thread → isolated agent session</p>
            </div>
          </div>
          <div className="divide-y divide-gray-800/50">
            {DISCORD_THREADS.map((thread) => (
              <div key={thread.id} className="px-5 py-3 hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-200">{thread.name}</span>
                    {thread.isolated && <span className="text-xs px-1.5 py-0.5 bg-violet-500/15 text-violet-400 rounded-full border border-violet-500/20">isolated</span>}
                  </div>
                  <span className={`text-xs ${thread.status === 'active' ? 'text-emerald-400' : thread.status === 'archived' ? 'text-gray-500' : 'text-blue-400'}`}>
                    {thread.status}
                  </span>
                </div>
                {thread.sessionId && (
                  <div className="text-xs text-gray-600 font-mono mt-0.5">{thread.sessionId} · {thread.messages} msgs</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Composio integrations */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Composio Integration Hub</h3>
            <span className="text-xs text-gray-500">500+ app connectors</span>
          </div>
          <div className="relative">
            <input
              value={composioSearch}
              onChange={e => setComposioSearch(e.target.value)}
              placeholder="Search apps..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-violet-500/60 w-40"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {filteredApps.map((app) => (
            <motion.button
              key={app}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 hover:border-violet-500/40 hover:bg-violet-500/10 rounded-lg text-xs text-gray-300 hover:text-violet-300 transition-all font-mono"
            >
              <CheckCircle size={10} className="text-emerald-400" />
              {app}
            </motion.button>
          ))}
          {filteredApps.length < COMPOSIO_APPS.length && (
            <div className="px-3 py-1.5 text-xs text-gray-600 font-mono">+ {COMPOSIO_APPS.length - filteredApps.length} more filtered</div>
          )}
          <div className="px-3 py-1.5 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg text-xs text-gray-600 font-mono">+ 476 more available</div>
        </div>
      </div>
    </div>
  );
}

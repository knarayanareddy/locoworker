import { useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, GitCommit, GitPullRequest, CheckCircle, RefreshCw, Play, Eye } from 'lucide-react';

const RECENT_PRS = [
  { id: 52, title: 'feat(auth): implement JWT refresh token rotation', branch: 'feature/jwt-refresh', status: 'open', reviews: 1, checks: 'passing', author: 'CoWork Agent', time: '2m ago' },
  { id: 51, title: 'fix(api): parameterize user search query (SQL injection)', branch: 'fix/sql-injection', status: 'merged', reviews: 2, checks: 'passing', author: 'Reviewer Agent', time: '1h ago' },
  { id: 50, title: 'chore(deps): bump bcrypt to 5.1.1', branch: 'chore/deps-update', status: 'open', reviews: 0, checks: 'passing', author: 'KAIROS Auto', time: '3h ago' },
  { id: 49, title: 'feat(memory): integrate Zep for long-term storage', branch: 'feature/zep-memory', status: 'merged', reviews: 3, checks: 'passing', author: 'CoWork Agent', time: '1d ago' },
];

const RECENT_COMMITS = [
  { hash: 'a7f3c12', message: 'feat(auth): add /auth/refresh endpoint', author: 'CoWork Agent', time: '2m ago' },
  { hash: 'b2e8d45', message: 'test(auth): 14/14 JWT rotation tests passing', author: 'CoWork Agent', time: '3m ago' },
  { hash: 'c9a1f78', message: 'fix(security): patch SQL injection in /users/search', author: 'Reviewer Agent', time: '1h ago' },
  { hash: 'd4c6b23', message: 'docs: update CLAUDE.md with auth patterns', author: 'Memory Keeper', time: '2h ago' },
  { hash: 'e7d2a56', message: 'chore: auto-update CLAUDE.md memory index', author: 'KAIROS Auto', time: '3h ago' },
];

const CODE_REVIEW_FINDINGS = [
  { file: 'src/auth/refresh.ts', line: 23, type: 'suggestion', message: 'Consider adding rate limiting to prevent token hammering' },
  { file: 'src/auth/middleware.ts', line: 45, type: 'info', message: 'Good use of short-lived tokens (15min) for security' },
  { file: 'src/api/users.ts', line: 89, type: 'warning', message: 'Input validation should happen before DB query' },
];

export default function GitWorkflow() {
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [committed, setCommitted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [diffView, setDiffView] = useState(false);

  const runCommit = () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setTimeout(() => {
      setCommitting(false);
      setCommitted(true);
      setTimeout(() => setCommitted(false), 3000);
    }, 1800);
  };

  const runReview = () => {
    setReviewing(true);
    setReviewDone(false);
    setTimeout(() => { setReviewing(false); setReviewDone(true); }, 2500);
  };

  const DIFF_CONTENT = `@@ -12,6 +12,34 @@ import { verifyToken } from './jwt';
 
 export async function verifyAuth(req, res, next) {
   const token = req.headers.authorization?.split(' ')[1];
+  
+  // Check token expiry and trigger refresh if needed
+  if (token && isTokenExpired(token)) {
+    const refreshToken = req.cookies?.refreshToken;
+    if (refreshToken) {
+      try {
+        const newTokens = await rotateRefreshToken(refreshToken);
+        res.setHeader('X-New-Access-Token', newTokens.accessToken);
+        res.cookie('refreshToken', newTokens.refreshToken, { httpOnly: true });
+      } catch {
+        return res.status(401).json({ error: 'Session expired' });
+      }
+    }
+  }`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Git Workflow</h1>
        <p className="text-sm text-gray-400 mt-1">AI-powered commit, review, and PR management via /commit-push-pr</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Commits Today', value: '47', icon: GitCommit, color: '#8b5cf6' },
          { label: 'PRs Open', value: '2', icon: GitPullRequest, color: '#3b82f6' },
          { label: 'Tests Passing', value: '347/347', icon: CheckCircle, color: '#10b981' },
          { label: 'Active Branches', value: '5', icon: GitBranch, color: '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <Icon size={16} style={{ color }} className="mb-2" />
            <div className="text-2xl font-bold text-white font-mono">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Smart commit */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitCommit size={14} className="text-violet-400" />
            <h3 className="text-sm font-semibold text-white">/commit-push-pr</h3>
          </div>
          <textarea
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="Describe what you built... AI will format the commit message"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500/60 mb-3"
          />
          <div className="flex gap-2">
            <button onClick={runCommit} disabled={committing || !commitMsg.trim()} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors">
              {committing ? <RefreshCw size={14} className="animate-spin" /> : committed ? <CheckCircle size={14} /> : <Play size={14} />}
              {committing ? 'Committing...' : committed ? 'Committed & PR Created!' : 'Commit + Push + PR'}
            </button>
            <button onClick={() => setDiffView(d => !d)} className="px-4 py-2.5 border border-gray-700 hover:border-gray-600 rounded-xl text-sm text-gray-300 transition-colors flex items-center gap-2">
              <Eye size={14} /> Diff
            </button>
          </div>
          {diffView && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 bg-gray-950 border border-gray-700 rounded-xl p-4 overflow-auto max-h-48">
              <pre className="text-xs font-mono">
                {DIFF_CONTENT.split('\n').map((line, i) => (
                  <div key={i} className={`${line.startsWith('+') ? 'text-emerald-400 bg-emerald-500/5' : line.startsWith('-') ? 'text-red-400 bg-red-500/5' : line.startsWith('@') ? 'text-blue-400' : 'text-gray-400'}`}>
                    {line}
                  </div>
                ))}
              </pre>
            </motion.div>
          )}
        </div>

        {/* Code review */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-white">/security-review</h3>
            </div>
            <button onClick={runReview} disabled={reviewing} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-xs text-blue-300 transition-colors">
              {reviewing ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
              {reviewing ? 'Reviewing...' : 'Run Review'}
            </button>
          </div>
          {reviewDone && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              {CODE_REVIEW_FINDINGS.map((f, i) => (
                <div key={i} className={`p-3 rounded-lg border text-xs ${f.type === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : f.type === 'suggestion' ? 'border-violet-500/30 bg-violet-500/5' : 'border-blue-500/30 bg-blue-500/5'}`}>
                  <div className={`font-medium mb-0.5 ${f.type === 'warning' ? 'text-amber-400' : f.type === 'suggestion' ? 'text-violet-400' : 'text-blue-400'}`}>
                    {f.type.toUpperCase()} · {f.file}:{f.line}
                  </div>
                  <div className="text-gray-300">{f.message}</div>
                </div>
              ))}
            </motion.div>
          )}
          {!reviewDone && !reviewing && (
            <div className="text-xs text-gray-500 py-4">Click "Run Review" to analyze current changes for security issues and code quality</div>
          )}
        </div>
      </div>

      {/* PRs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Pull Requests</h3>
        </div>
        <div className="divide-y divide-gray-800/50">
          {RECENT_PRS.map((pr) => (
            <div key={pr.id} className="px-5 py-4 hover:bg-gray-800/30 transition-colors">
              <div className="flex items-start gap-3">
                <GitPullRequest size={16} className={`mt-0.5 flex-shrink-0 ${pr.status === 'merged' ? 'text-violet-400' : 'text-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{pr.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${pr.status === 'merged' ? 'bg-violet-500/15 text-violet-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{pr.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span className="font-mono">{pr.branch}</span>
                    <span>·</span>
                    <span>{pr.author}</span>
                    <span>·</span>
                    <span>{pr.reviews} review{pr.reviews !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span className="text-emerald-400">{pr.checks}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-500">{pr.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent commits */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Recent Commits</h3>
        </div>
        <div className="divide-y divide-gray-800/50">
          {RECENT_COMMITS.map((c) => (
            <div key={c.hash} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors">
              <span className="text-xs font-mono text-violet-400 flex-shrink-0">{c.hash}</span>
              <span className="text-sm text-gray-200 flex-1">{c.message}</span>
              <span className="text-xs text-gray-500">{c.author}</span>
              <span className="text-xs text-gray-600">{c.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

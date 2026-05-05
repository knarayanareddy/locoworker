export const AGENTS = [
  { id: 'orchestrator', name: 'Orchestrator', model: 'claude-opus-4-5', status: 'active', tasks: 12, color: '#8b5cf6' },
  { id: 'researcher', name: 'Researcher', model: 'gpt-4o', status: 'active', tasks: 7, color: '#3b82f6' },
  { id: 'coder', name: 'Coder', model: 'claude-sonnet-4-5', status: 'active', tasks: 23, color: '#10b981' },
  { id: 'reviewer', name: 'Reviewer', model: 'deepseek-chat', status: 'idle', tasks: 5, color: '#f59e0b' },
  { id: 'memory-keeper', name: 'Memory Keeper', model: 'gemini-1.5-pro', status: 'active', tasks: 9, color: '#ef4444' },
];

export const SESSIONS = [
  { id: 's1', title: 'Refactor Auth Module', agent: 'Coder', turns: 34, tokens: 48200, status: 'active', time: '2m ago', provider: 'claude-opus-4-5' },
  { id: 's2', title: 'Research: KAIROS Patterns', agent: 'Researcher', turns: 18, tokens: 22100, status: 'active', time: '5m ago', provider: 'gpt-4o' },
  { id: 's3', title: 'Security Audit Pass #3', agent: 'Reviewer', turns: 9, tokens: 11400, status: 'compacted', time: '12m ago', provider: 'claude-sonnet-4-5' },
  { id: 's4', title: 'AutoDream Consolidation', agent: 'Memory Keeper', turns: 56, tokens: 94300, status: 'archived', time: '1h ago', provider: 'gemini-1.5-pro' },
  { id: 's5', title: 'Deploy Pipeline Config', agent: 'Orchestrator', turns: 41, tokens: 67000, status: 'active', time: '3m ago', provider: 'deepseek-chat' },
];

export const SLASH_COMMANDS = [
  { name: '/compact', category: 'Memory', desc: 'Compress conversation context intelligently', status: 'stable' },
  { name: '/memory', category: 'Memory', desc: 'View and manage agent memory index', status: 'stable' },
  { name: '/dream', category: 'Memory', desc: 'Trigger AutoDream memory consolidation', status: 'rolling_out' },
  { name: '/ultraplan', category: 'Planning', desc: 'Extended multi-step planning with full context', status: 'unreleased' },
  { name: '/commit', category: 'Git', desc: 'Intelligent commit with smart message generation', status: 'stable' },
  { name: '/commit-push-pr', category: 'Git', desc: 'Full git workflow: commit → push → PR creation', status: 'stable' },
  { name: '/review', category: 'Git', desc: 'AI-powered code review with security analysis', status: 'stable' },
  { name: '/security-review', category: 'Git', desc: 'Deep security vulnerability scan', status: 'stable' },
  { name: '/wiki-ingest', category: 'Knowledge', desc: 'Ingest docs into LLMWiki knowledge base', status: 'cowork_ext' },
  { name: '/wiki-query', category: 'Knowledge', desc: 'Semantic search across knowledge base', status: 'cowork_ext' },
  { name: '/graphify', category: 'Graph', desc: 'Convert docs to Neo4j knowledge graph', status: 'cowork_ext' },
  { name: '/simulate', category: 'Simulation', desc: 'Launch MiroFish multi-agent simulation', status: 'cowork_ext' },
  { name: '/autorun', category: 'Research', desc: 'Start AutoResearch loop with eval metric', status: 'cowork_ext' },
  { name: '/council', category: 'Agents', desc: 'Convene multi-model agent council', status: 'cowork_ext' },
  { name: '/notify', category: 'Messaging', desc: 'Send alert via Telegram/Discord/WhatsApp', status: 'cowork_ext' },
  { name: '/agent-chat', category: 'Simulation', desc: 'Chat with any simulated MiroFish agent', status: 'cowork_ext' },
  { name: '/status', category: 'Diagnostics', desc: 'Full system health dashboard', status: 'stable' },
  { name: '/cost', category: 'Diagnostics', desc: 'Real-time token cost breakdown', status: 'stable' },
  { name: '/doctor', category: 'Diagnostics', desc: 'Diagnose configuration & connectivity', status: 'stable' },
];

export const TOOLS = [
  { name: 'FileReadTool', level: 0, description: 'Read any file in workspace', calls: 1247 },
  { name: 'FileWriteTool', level: 2, description: 'Write/edit files with diff tracking', calls: 891 },
  { name: 'BashTool', level: 2, description: 'Execute shell commands (sandboxed)', calls: 634 },
  { name: 'WebSearchTool', level: 1, description: 'Search the web for current info', calls: 412 },
  { name: 'SendNotificationTool', level: 3, description: 'Push notifications via gateway', calls: 89 },
  { name: 'FileDeliveryTool', level: 4, description: 'Deliver files to external systems', calls: 34 },
  { name: 'MessageGatewayTool', level: 4, description: 'Send messages via Telegram/Discord', calls: 67 },
  { name: 'GraphQueryTool', level: 2, description: 'Query Neo4j knowledge graph', calls: 223 },
  { name: 'MemorySearchTool', level: 1, description: 'Semantic search over memory index', calls: 456 },
  { name: 'GitTool', level: 2, description: 'Full git operations with hooks', calls: 178 },
];

export const MEMORY_ENTRIES = [
  { id: 'm1', type: 'episodic', content: 'Implemented JWT refresh token rotation with 15min expiry', relevance: 0.94, timestamp: '2025-01-15 14:23' },
  { id: 'm2', type: 'semantic', content: 'Auth module uses bcrypt with cost factor 12 for password hashing', relevance: 0.89, timestamp: '2025-01-15 13:45' },
  { id: 'm3', type: 'procedural', content: 'Deploy pipeline: lint → test → build → docker → k8s rollout', relevance: 0.87, timestamp: '2025-01-14 09:12' },
  { id: 'm4', type: 'episodic', content: 'Security audit found SQL injection risk in user search endpoint — patched', relevance: 0.82, timestamp: '2025-01-14 16:30' },
  { id: 'm5', type: 'semantic', content: 'Neo4j instance runs on bolt://localhost:7687 with APOC plugins', relevance: 0.79, timestamp: '2025-01-13 11:00' },
  { id: 'm6', type: 'procedural', content: 'AutoDream runs every night at 2am to consolidate session transcripts', relevance: 0.76, timestamp: '2025-01-12 02:00' },
];

export const SIMULATION_AGENTS = [
  { id: 'a1', name: 'TechOptimist_42', persona: 'Early adopter, enthusiastic about AI tools', sentiment: 0.82, platform: 'twitter', posts: 47, connections: 234 },
  { id: 'a2', name: 'SkepticalDev_99', persona: 'Senior engineer, critical of hype cycles', sentiment: 0.31, platform: 'reddit', posts: 23, connections: 156 },
  { id: 'a3', name: 'ProductManager_X', persona: 'Business-focused, metrics-driven mindset', sentiment: 0.65, platform: 'twitter', posts: 89, connections: 512 },
  { id: 'a4', name: 'OpenSourceAdvocate', persona: 'Strong OSS believer, privacy-conscious', sentiment: 0.54, platform: 'reddit', posts: 34, connections: 287 },
  { id: 'a5', name: 'StartupFounder_7', persona: 'Hustler mentality, growth-oriented', sentiment: 0.78, platform: 'twitter', posts: 112, connections: 891 },
  { id: 'a6', name: 'AcademicResearcher', persona: 'Methodical, peer-review oriented', sentiment: 0.61, platform: 'reddit', posts: 18, connections: 98 },
];

export const TOKEN_USAGE_DATA = [
  { time: '00:00', input: 1200, output: 800, cache: 400 },
  { time: '04:00', input: 400, output: 200, cache: 150 },
  { time: '08:00', input: 3200, output: 2100, cache: 1200 },
  { time: '10:00', input: 8900, output: 6200, cache: 3400 },
  { time: '12:00', input: 12400, output: 8900, cache: 5600 },
  { time: '14:00', input: 15200, output: 11000, cache: 7800 },
  { time: '16:00', input: 18900, output: 13400, cache: 9200 },
  { time: '18:00', input: 14200, output: 10100, cache: 6800 },
  { time: '20:00', input: 9800, output: 7200, cache: 4100 },
  { time: '22:00', input: 5400, output: 3900, cache: 2200 },
];

export const PROVIDER_COSTS = {
  'claude-opus-4-5': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-3-5': { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
};

export const RESEARCH_EXPERIMENTS = [
  { id: 1, hypothesis: 'Increase RRF-K from 60 to 80 for better recall', score: 0.847, status: 'accepted', delta: '+0.031' },
  { id: 2, hypothesis: 'Add BM25 hybrid scoring alongside embedding', score: 0.791, status: 'rejected', delta: '-0.025' },
  { id: 3, hypothesis: 'Use chunk size 512 instead of 256 tokens', score: 0.863, status: 'accepted', delta: '+0.016' },
  { id: 4, hypothesis: 'Add reranker layer with cross-encoder', score: 0.891, status: 'accepted', delta: '+0.028' },
  { id: 5, hypothesis: 'Reduce embedding dimensions to 384', score: 0.812, status: 'rejected', delta: '-0.079' },
  { id: 6, hypothesis: 'Add metadata filters for temporal recency', score: 0.904, status: 'running', delta: '+0.013' },
];

export const WIKI_NODES = [
  { id: 'w1', title: 'Authentication Architecture', type: 'system', connections: 8, lastUpdated: '2h ago' },
  { id: 'w2', title: 'KAIROS Heartbeat Loop', type: 'feature', connections: 12, lastUpdated: '1d ago' },
  { id: 'w3', title: 'AutoDream Memory Pipeline', type: 'feature', connections: 6, lastUpdated: '6h ago' },
  { id: 'w4', title: 'Neo4j Graph Schema', type: 'data', connections: 15, lastUpdated: '3d ago' },
  { id: 'w5', title: 'Security Permission Matrix', type: 'policy', connections: 9, lastUpdated: '12h ago' },
  { id: 'w6', title: 'MiroFish Simulation Agents', type: 'feature', connections: 7, lastUpdated: '2d ago' },
  { id: 'w7', title: 'Composio Integration Hub', type: 'integration', connections: 11, lastUpdated: '4h ago' },
  { id: 'w8', title: 'Discord Thread Isolation', type: 'feature', connections: 4, lastUpdated: '1d ago' },
];

export const GATEWAY_CHANNELS = [
  { id: 'telegram', name: 'Telegram', icon: '✈️', status: 'connected', messages: 1247, latency: '42ms' },
  { id: 'discord', name: 'Discord', icon: '🎮', status: 'connected', messages: 892, latency: '67ms' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬', status: 'disconnected', messages: 0, latency: '—' },
  { id: 'slack', name: 'Slack', icon: '⚡', status: 'connected', messages: 456, latency: '38ms' },
];

export const KAIROS_LOG = [
  { time: '14:23:01', action: 'Checked GitHub PRs — 2 new reviews requested', type: 'act' },
  { time: '14:22:30', action: 'Quiet tick (no action needed)', type: 'quiet' },
  { time: '14:22:00', action: 'Memory consolidation triggered — 3 transcripts merged', type: 'act' },
  { time: '14:21:30', action: 'Quiet tick (no action needed)', type: 'quiet' },
  { time: '14:21:00', action: 'Sent Telegram notification: PR #47 needs attention', type: 'act' },
  { time: '14:20:30', action: 'Responded to Discord message in #dev-ops thread', type: 'act' },
  { time: '14:20:00', action: 'Quiet tick (no action needed)', type: 'quiet' },
  { time: '14:19:30', action: 'Wiki lint pass complete — 2 stale nodes flagged', type: 'act' },
];

export const SECURITY_CHECKS = [
  { check: 'CLAUDE.md Injection Scan', status: 'pass', severity: null },
  { check: 'MCP Server Integrity', status: 'pass', severity: null },
  { check: 'Bash Wildcard Permissions', status: 'warn', severity: 'MEDIUM' },
  { check: 'Sandbox Status', status: 'pass', severity: null },
  { check: 'Session Length Guard', status: 'pass', severity: null },
  { check: 'Binary Hash Verification', status: 'pass', severity: null },
  { check: 'Config Change Monitor', status: 'pass', severity: null },
  { check: 'Dangerous Tool Approval', status: 'pass', severity: null },
];

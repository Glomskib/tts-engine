'use client';

import { useState, useCallback } from 'react';
import {
  BookOpen, ChevronDown, ChevronRight, Play, Copy, Check,
  Lock, Unlock, Package, FileText, Video, Trophy, BarChart3,
  Users, Zap, Activity, Eye, CreditCard, Bot, Webhook,
} from 'lucide-react';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
}

interface ApiSection {
  name: string;
  icon: typeof BookOpen;
  endpoints: Endpoint[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400 border-green-500/30',
  POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PUT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  PATCH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const API_SECTIONS: ApiSection[] = [
  {
    name: 'Products',
    icon: Package,
    endpoints: [
      { method: 'GET', path: '/api/products', description: 'List all products', auth: true },
      { method: 'POST', path: '/api/products', description: 'Create a product', auth: true },
      { method: 'GET', path: '/api/products/[id]', description: 'Get product by ID', auth: true },
      { method: 'PATCH', path: '/api/products/[id]', description: 'Update a product', auth: true },
      { method: 'DELETE', path: '/api/products/[id]', description: 'Delete a product', auth: true },
    ],
  },
  {
    name: 'Scripts',
    icon: FileText,
    endpoints: [
      { method: 'GET', path: '/api/scripts', description: 'List all scripts', auth: true },
      { method: 'POST', path: '/api/scripts', description: 'Create a script', auth: true },
      { method: 'POST', path: '/api/scripts/generate', description: 'Generate AI script', auth: true },
      { method: 'GET', path: '/api/scripts/[id]', description: 'Get script by ID', auth: true },
      { method: 'PUT', path: '/api/scripts/[id]', description: 'Update a script', auth: true },
      { method: 'POST', path: '/api/scripts/[id]/approve', description: 'Approve a script', auth: true },
      { method: 'POST', path: '/api/scripts/[id]/rewrite', description: 'Rewrite a script', auth: true },
      { method: 'GET', path: '/api/scripts/library', description: 'Get script library', auth: true },
    ],
  },
  {
    name: 'Videos (Pipeline)',
    icon: Video,
    endpoints: [
      { method: 'GET', path: '/api/admin/videos', description: 'List all videos', auth: true },
      { method: 'POST', path: '/api/videos', description: 'Create a video', auth: true },
      { method: 'GET', path: '/api/videos/[id]', description: 'Get video by ID', auth: false },
      { method: 'PATCH', path: '/api/videos/[id]', description: 'Update a video', auth: true },
      { method: 'DELETE', path: '/api/videos/[id]', description: 'Delete a video', auth: true },
      { method: 'POST', path: '/api/videos/[id]/stats', description: 'Update TikTok stats', auth: true },
      { method: 'POST', path: '/api/videos/[id]/assign', description: 'Assign to editor', auth: true },
      { method: 'GET', path: '/api/videos/lookup', description: 'Lookup by video code or URL', auth: true },
      { method: 'POST', path: '/api/videos/detect-winners', description: 'Batch detect winners', auth: true },
      { method: 'GET', path: '/api/videos/queue', description: 'Get video queue', auth: true },
    ],
  },
  {
    name: 'Winners Bank',
    icon: Trophy,
    endpoints: [
      { method: 'GET', path: '/api/admin/winners-bank', description: 'List all winners', auth: true },
      { method: 'POST', path: '/api/winners', description: 'Add a winner', auth: true },
      { method: 'GET', path: '/api/winners/[id]', description: 'Get winner by ID', auth: true },
      { method: 'PATCH', path: '/api/winners/[id]', description: 'Update a winner', auth: true },
      { method: 'DELETE', path: '/api/winners/[id]', description: 'Delete a winner', auth: true },
      { method: 'POST', path: '/api/winners/[id]/analyze', description: 'AI analyze winner', auth: true },
      { method: 'GET', path: '/api/winners/intelligence', description: 'Get winner intelligence', auth: true },
    ],
  },
  {
    name: 'Analytics',
    icon: BarChart3,
    endpoints: [
      { method: 'GET', path: '/api/analytics?type=throughput', description: 'Pipeline throughput metrics', auth: true },
      { method: 'GET', path: '/api/analytics?type=velocity', description: 'Production velocity', auth: true },
      { method: 'GET', path: '/api/analytics?type=top-content', description: 'Top performing content', auth: true },
      { method: 'GET', path: '/api/analytics?type=revenue', description: 'Revenue analytics', auth: true },
      { method: 'GET', path: '/api/analytics?type=hooks', description: 'Hook performance', auth: true },
      { method: 'GET', path: '/api/analytics?type=va-performance', description: 'VA team performance', auth: true },
      { method: 'GET', path: '/api/analytics?type=accounts', description: 'Account analytics', auth: true },
    ],
  },
  {
    name: 'Accounts',
    icon: Users,
    endpoints: [
      { method: 'GET', path: '/api/accounts', description: 'List TikTok accounts', auth: true },
      { method: 'POST', path: '/api/accounts', description: 'Create account', auth: true },
      { method: 'GET', path: '/api/posting-accounts', description: 'List posting accounts', auth: true },
      { method: 'POST', path: '/api/posting-accounts', description: 'Create posting account', auth: true },
      { method: 'PATCH', path: '/api/posting-accounts/[id]', description: 'Update posting account', auth: true },
    ],
  },
  {
    name: 'Hooks',
    icon: Zap,
    endpoints: [
      { method: 'POST', path: '/api/hooks/generate', description: 'Generate hook variations', auth: true },
      { method: 'GET', path: '/api/hooks/proven', description: 'Get proven hooks', auth: true },
      { method: 'POST', path: '/api/hooks/proven', description: 'Save proven hook', auth: true },
      { method: 'GET', path: '/api/saved-hooks', description: 'List saved hooks', auth: true },
      { method: 'POST', path: '/api/saved-hooks', description: 'Save a hook', auth: true },
      { method: 'DELETE', path: '/api/saved-hooks/[id]', description: 'Delete saved hook', auth: true },
    ],
  },
  {
    name: 'Activity',
    icon: Activity,
    endpoints: [
      { method: 'GET', path: '/api/activity', description: 'List activity log', auth: true },
      { method: 'POST', path: '/api/activity', description: 'Log an activity', auth: true },
    ],
  },
  {
    name: 'Observability',
    icon: Eye,
    endpoints: [
      { method: 'GET', path: '/api/observability/health', description: 'System health check', auth: false },
      { method: 'GET', path: '/api/observability/queue-summary', description: 'Queue summary', auth: false },
      { method: 'GET', path: '/api/observability/throughput', description: 'System throughput', auth: false },
      { method: 'GET', path: '/api/observability/stuck', description: 'Stuck items', auth: false },
    ],
  },
  {
    name: 'Auth & User',
    icon: CreditCard,
    endpoints: [
      { method: 'GET', path: '/api/auth/me', description: 'Get current user', auth: true },
      { method: 'GET', path: '/api/user/api-keys', description: 'List API keys', auth: true },
      { method: 'POST', path: '/api/user/api-keys', description: 'Create API key', auth: true },
      { method: 'DELETE', path: '/api/user/api-keys/[key_id]', description: 'Revoke API key', auth: true },
      { method: 'GET', path: '/api/user/settings', description: 'Get user settings', auth: true },
    ],
  },
  {
    name: 'Clawbot / AI',
    icon: Bot,
    endpoints: [
      { method: 'POST', path: '/api/clawbot/generate-skit', description: 'Generate skit via Clawbot', auth: true },
      { method: 'POST', path: '/api/clawbot/generate-like-winner', description: 'Generate script from winner', auth: true },
      { method: 'GET', path: '/api/clawbot/summaries/latest', description: 'Latest summary', auth: false },
      { method: 'POST', path: '/api/ai/draft-video-brief', description: 'Draft video brief', auth: true },
      { method: 'POST', path: '/api/remix', description: 'Remix content (variation, angle, tone)', auth: true },
    ],
  },
  {
    name: 'Webhooks & External',
    icon: Webhook,
    endpoints: [
      { method: 'GET', path: '/api/admin/webhooks', description: 'List webhooks', auth: true },
      { method: 'POST', path: '/api/admin/webhooks', description: 'Create webhook', auth: true },
      { method: 'POST', path: '/api/admin/webhooks/test', description: 'Test a webhook', auth: true },
      { method: 'GET', path: '/api/health', description: 'Health check', auth: false },
    ],
  },
];

function TryItButton({ endpoint }: { endpoint: Endpoint }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tryIt = useCallback(async () => {
    if (endpoint.method !== 'GET') return;
    setLoading(true);
    try {
      const res = await fetch(endpoint.path);
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2).slice(0, 500));
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  if (endpoint.method !== 'GET' || endpoint.path.includes('[')) return null;

  return (
    <>
      <button
        onClick={tryIt}
        disabled={loading}
        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-teal-500/10 text-teal-400 border border-teal-500/30 rounded hover:bg-teal-500/20 transition-colors disabled:opacity-50"
      >
        <Play className="w-3 h-3" />
        {loading ? 'Loading...' : 'Try It'}
      </button>
      {result && (
        <pre className="mt-2 p-3 text-xs bg-zinc-950 rounded-lg border border-zinc-800 overflow-x-auto max-h-48 text-zinc-400">
          {result}
        </pre>
      )}
    </>
  );
}

export default function ApiDocsPage() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Products']));
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const toggleSection = (name: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const totalEndpoints = API_SECTIONS.reduce((sum, s) => sum + s.endpoints.length, 0);

  return (
    <div className="max-w-4xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-7 h-7 text-teal-400" />
          <h1 className="text-2xl font-bold text-white">API Documentation</h1>
        </div>
        <p className="text-zinc-400">
          {API_SECTIONS.length} categories, {totalEndpoints} endpoints. All authenticated endpoints accept session cookies or Bearer token (<code className="text-teal-400">ff_ak_*</code>).
        </p>
      </div>

      {/* Auth Info */}
      <div className="mb-6 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
        <h3 className="text-sm font-medium text-white mb-2">Authentication</h3>
        <div className="text-sm text-zinc-400 space-y-1">
          <p><Lock className="w-3.5 h-3.5 inline mr-1 text-yellow-400" /> <strong>Session</strong>: Cookie-based auth via Supabase (automatic in browser)</p>
          <p><Lock className="w-3.5 h-3.5 inline mr-1 text-blue-400" /> <strong>API Key</strong>: <code className="text-teal-400">Authorization: Bearer ff_ak_...</code> header</p>
          <p><Unlock className="w-3.5 h-3.5 inline mr-1 text-green-400" /> <strong>Public</strong>: No auth required</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {API_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSections.has(section.name);

          return (
            <div key={section.name} className="rounded-xl border border-zinc-800 overflow-hidden">
              <button
                onClick={() => toggleSection(section.name)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                <Icon className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-medium text-white">{section.name}</span>
                <span className="ml-auto text-xs text-zinc-600">{section.endpoints.length} endpoints</span>
              </button>

              {isExpanded && (
                <div className="divide-y divide-zinc-800/50">
                  {section.endpoints.map((ep, i) => (
                    <div key={i} className="px-4 py-3 hover:bg-zinc-900/30 transition-colors">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${METHOD_COLORS[ep.method]}`}>
                          {ep.method}
                        </span>
                        <button
                          onClick={() => copyPath(ep.path)}
                          className="font-mono text-sm text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5"
                        >
                          {ep.path}
                          {copiedPath === ep.path ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-zinc-600" />
                          )}
                        </button>
                        <span className="text-xs text-zinc-500 ml-auto hidden sm:inline">{ep.description}</span>
                        {ep.auth ? (
                          <Lock className="w-3.5 h-3.5 text-yellow-500/60" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5 text-green-500/60" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1 sm:hidden">{ep.description}</p>
                      <TryItButton endpoint={ep} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

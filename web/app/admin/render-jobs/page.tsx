'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageLayout from '../components/AdminPageLayout';
import {
  Monitor, Wifi, WifiOff, CheckCircle2, XCircle, Loader2, Clock,
  RefreshCw, AlertTriangle, BarChart2, Film, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RenderNode {
  node_id: string;
  last_seen: string;
  current_job_id: string | null;
  ffmpeg_version: string | null;
  platform: string | null;
  online: boolean;
}

interface RenderJob {
  id: string;
  workspace_id: string;
  job_type: string;
  status: 'queued' | 'claimed' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  progress_pct: number;
  progress_message: string | null;
  node_id: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function duration(start: string, end?: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const STATUS_STYLE: Record<string, string> = {
  queued:     'bg-zinc-700 text-zinc-300',
  claimed:    'bg-blue-900/50 text-blue-300 border border-blue-700/30',
  processing: 'bg-teal-900/50 text-teal-300 border border-teal-700/30',
  completed:  'bg-green-900/50 text-green-300 border border-green-700/30',
  failed:     'bg-red-900/50 text-red-300 border border-red-700/30',
  cancelled:  'bg-zinc-700 text-zinc-500',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued:     <Clock className="w-3 h-3" />,
  claimed:    <Zap className="w-3 h-3" />,
  processing: <Loader2 className="w-3 h-3 animate-spin" />,
  completed:  <CheckCircle2 className="w-3 h-3" />,
  failed:     <XCircle className="w-3 h-3" />,
  cancelled:  <XCircle className="w-3 h-3" />,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function NodeCard({ node }: { node: RenderNode }) {
  return (
    <div className={`bg-zinc-900 border rounded-2xl p-4 transition-all ${
      node.online ? 'border-teal-500/30 shadow-sm shadow-teal-500/10' : 'border-zinc-800'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${node.online ? 'bg-teal-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-sm font-bold text-white">{node.node_id}</span>
        </div>
        {node.online
          ? <span className="text-[10px] text-teal-400 flex items-center gap-1"><Wifi className="w-3 h-3" /> Online</span>
          : <span className="text-[10px] text-zinc-600 flex items-center gap-1"><WifiOff className="w-3 h-3" /> Offline</span>
        }
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-zinc-500">
          <span className="text-zinc-400">Last seen:</span> {timeAgo(node.last_seen)}
        </p>
        {node.current_job_id && (
          <p className="text-[11px] text-teal-400">
            Processing job: {node.current_job_id.slice(0, 8)}...
          </p>
        )}
        {node.ffmpeg_version && (
          <p className="text-[11px] text-zinc-600">FFmpeg {node.ffmpeg_version}</p>
        )}
        {node.platform && (
          <p className="text-[11px] text-zinc-600 truncate">{node.platform}</p>
        )}
      </div>
    </div>
  );
}

function JobRow({ job, expanded, onToggle }: {
  job: RenderJob;
  expanded: boolean;
  onToggle: () => void;
}) {
  const activeTime = job.started_at
    ? duration(job.started_at, job.completed_at)
    : job.claimed_at
      ? duration(job.claimed_at)
      : null;

  return (
    <>
      <tr
        className={`border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-800/30 transition-colors ${expanded ? 'bg-zinc-800/20' : ''}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[job.status]}`}>
              {STATUS_ICON[job.status]}
              {job.status}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <code className="text-xs text-zinc-400">{job.id.slice(0, 8)}</code>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-zinc-300">{job.job_type.replace('_', ' ')}</span>
        </td>
        <td className="px-4 py-3">
          {job.status === 'processing' && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-[60px]">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${job.progress_pct}%` }} />
              </div>
              <span className="text-[10px] text-zinc-400 flex-shrink-0">{job.progress_pct}%</span>
            </div>
          )}
          {job.status === 'completed' && <span className="text-xs text-green-400">Done</span>}
          {job.status === 'failed' && <span className="text-xs text-red-400 truncate max-w-[120px] block">{job.error?.slice(0, 40) || 'Failed'}</span>}
          {(job.status === 'queued' || job.status === 'claimed') && (
            <span className="text-xs text-zinc-500">Waiting...</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-zinc-500">{job.node_id || '—'}</span>
        </td>
        <td className="px-4 py-3">
          <div>
            <span className="text-xs text-zinc-400">{timeAgo(job.created_at)}</span>
            {activeTime && <span className="text-[10px] text-zinc-600 block">{activeTime}</span>}
          </div>
        </td>
        <td className="px-4 py-3 text-zinc-600">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-900/50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div><span className="text-zinc-600 block">Job ID</span><code className="text-zinc-300">{job.id}</code></div>
              <div><span className="text-zinc-600 block">Workspace</span><code className="text-zinc-300">{job.workspace_id.slice(0, 8)}...</code></div>
              <div><span className="text-zinc-600 block">Priority</span><span className="text-zinc-300">{job.priority}</span></div>
              <div><span className="text-zinc-600 block">Retries</span><span className="text-zinc-300">{job.retry_count}</span></div>
              {job.progress_message && (
                <div className="col-span-2"><span className="text-zinc-600 block">Progress</span><span className="text-zinc-300">{job.progress_message}</span></div>
              )}
              {job.error && (
                <div className="col-span-4"><span className="text-zinc-600 block">Error</span><span className="text-red-400">{job.error}</span></div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUSES = ['all', 'queued', 'claimed', 'processing', 'completed', 'failed'];

export default function RenderJobsPage() {
  const [nodes, setNodes] = useState<RenderNode[]>([]);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [queueStats, setQueueStats] = useState({ queued: 0, processing: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // Fetch nodes + queue stats (uses session auth)
      const nodeRes = await fetch('/api/render-jobs/heartbeat');

      // Fetch jobs list
      const statusQ = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const jobsRes = await fetch(`/api/render-jobs/admin?limit=50${statusQ}`);

      if (nodeRes.ok) {
        const nodeJson = await nodeRes.json();
        setNodes(nodeJson.data?.nodes || []);
        setQueueStats(nodeJson.data?.queue || { queued: 0, processing: 0 });
      }

      if (jobsRes.ok) {
        const jobsJson = await jobsRes.json();
        setJobs(jobsJson.data || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const onlineNodes = nodes.filter(n => n.online);
  const filteredJobs = statusFilter === 'all' ? jobs : jobs.filter(j => j.status === statusFilter);

  return (
    <AdminPageLayout
      title="Render Jobs"
      subtitle="Mac mini render node monitor"
      maxWidth="full"
      isAdmin
      headerActions={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
            <div
              onClick={() => setAutoRefresh(p => !p)}
              className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${autoRefresh ? 'bg-teal-600' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${autoRefresh ? 'left-4' : 'left-0.5'}`} />
            </div>
            Auto-refresh
          </label>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      }
    >
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Nodes online', value: onlineNodes.length, total: nodes.length, color: onlineNodes.length > 0 ? 'text-teal-400' : 'text-red-400', icon: Monitor },
          { label: 'In queue', value: queueStats.queued, color: queueStats.queued > 0 ? 'text-yellow-400' : 'text-zinc-400', icon: Clock },
          { label: 'Processing', value: queueStats.processing, color: queueStats.processing > 0 ? 'text-teal-400' : 'text-zinc-400', icon: Loader2 },
          { label: 'Total jobs', value: jobs.length, color: 'text-zinc-300', icon: Film },
        ].map(({ label, value, total, color, icon: Icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-zinc-600" />
              <span className="text-xs text-zinc-500">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>
              {value}
              {total !== undefined && <span className="text-sm text-zinc-600 font-normal ml-1">/ {total}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Node cards */}
      {nodes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Render Nodes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {nodes.map(node => <NodeCard key={node.node_id} node={node} />)}
          </div>
        </div>
      )}

      {nodes.length === 0 && !loading && (
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
          <WifiOff className="w-5 h-5 text-zinc-600" />
          <div>
            <p className="text-sm font-semibold text-zinc-300">No render nodes online</p>
            <p className="text-xs text-zinc-500">Start the agent on your Mac mini: <code className="text-zinc-400">pm2 start ecosystem.config.js</code></p>
          </div>
        </div>
      )}

      {/* Jobs table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Jobs</p>
          <div className="flex items-center gap-1">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No {statusFilter !== 'all' ? statusFilter : ''} jobs found
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  {['Status', 'ID', 'Type', 'Progress', 'Node', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    expanded={expandedJob === job.id}
                    onToggle={() => setExpandedJob(p => p === job.id ? null : job.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
}

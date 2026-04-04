'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, AlertTriangle, Clock, Film, RefreshCw } from 'lucide-react';

interface RenderItem {
  id: string;
  title: string;
  short_id: string;
  edit_status: string;
  render_error: string | null;
  last_rendered_at: string | null;
  updated_at: string;
}

interface RenderJob {
  id: string;
  type: string;
  status: string;
  payload: { content_item_id?: string; actor_id?: string };
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  not_started: { icon: <Clock className="w-3.5 h-3.5" />, label: 'Not Started', color: 'text-zinc-500' },
  planning: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'Planning', color: 'text-blue-400' },
  ready_to_render: { icon: <Film className="w-3.5 h-3.5" />, label: 'Ready', color: 'text-amber-400' },
  rendering: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'Rendering', color: 'text-violet-400' },
  rendered: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Done', color: 'text-green-400' },
  failed: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Failed', color: 'text-red-400' },
};

const JOB_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Queued', color: 'text-amber-400' },
  running: { label: 'Rendering', color: 'text-violet-400' },
  completed: { label: 'Done', color: 'text-green-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
};

export function RenderQueuePanel() {
  const [items, setItems] = useState<RenderItem[]>([]);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchRenderQueue = useCallback(async () => {
    try {
      // Fetch both content items in editing pipeline and render jobs
      const [itemsRes, jobsRes] = await Promise.all([
        fetch('/api/content-items?view=board&limit=50'),
        fetch('/api/jobs?type=render_video&limit=20'),
      ]);

      const itemsJson = await itemsRes.json();
      if (itemsJson.ok) {
        const all = (itemsJson.data || []) as RenderItem[];
        const editingItems = all.filter((item: RenderItem) =>
          item.edit_status && item.edit_status !== 'not_started'
        );
        setItems(editingItems);

        const c: Record<string, number> = {};
        for (const item of editingItems) {
          c[item.edit_status] = (c[item.edit_status] || 0) + 1;
        }
        setCounts(c);
      }

      // Jobs endpoint may not exist yet — gracefully handle
      if (jobsRes.ok) {
        const jobsJson = await jobsRes.json();
        if (jobsJson.ok) {
          setJobs((jobsJson.data || []) as RenderJob[]);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRenderQueue(); }, [fetchRenderQueue]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Film className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Render Queue</h3>
        </div>
        <div className="text-xs text-zinc-500 text-center py-4">Loading...</div>
      </div>
    );
  }

  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'running');

  if (items.length === 0 && activeJobs.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Film className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Render Queue</h3>
        </div>
        <div className="text-xs text-zinc-500 text-center py-4">No items in editing pipeline</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-violet-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Render Queue</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{items.length} items in editing pipeline</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchRenderQueue(); }}
          className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
        </button>
      </div>

      {/* Active render jobs */}
      {activeJobs.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-2">Active Jobs</p>
          <div className="space-y-1.5">
            {activeJobs.map((job) => {
              const style = JOB_STATUS_STYLES[job.status] || JOB_STATUS_STYLES.pending;
              return (
                <div key={job.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-violet-900/20 border border-violet-800/30 rounded-lg">
                  {job.status === 'running' ? (
                    <Loader2 className={`w-3.5 h-3.5 animate-spin ${style.color}`} />
                  ) : (
                    <Clock className={`w-3.5 h-3.5 ${style.color}`} />
                  )}
                  <span className="flex-1 text-xs text-zinc-300 truncate">
                    {job.payload.content_item_id?.slice(0, 8)}...
                  </span>
                  <span className={`text-[10px] font-medium ${style.color}`}>{style.label}</span>
                  {job.attempts > 1 && (
                    <span className="text-[10px] text-zinc-600">attempt {job.attempts}/{job.max_attempts}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status summary */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(counts).map(([status, count]) => {
          const style = STATUS_STYLES[status] || STATUS_STYLES.not_started;
          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={style.color}>{style.icon}</span>
              <span className="text-xs text-zinc-400">{style.label}: <span className="font-medium text-white tabular-nums">{count}</span></span>
            </div>
          );
        })}
      </div>

      {/* Content items in editing pipeline */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {items.slice(0, 20).map((item) => {
          const style = STATUS_STYLES[item.edit_status] || STATUS_STYLES.not_started;
          return (
            <div key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/40 rounded-lg">
              <span className={style.color}>{style.icon}</span>
              <span className="flex-1 text-xs text-zinc-300 truncate">{item.title}</span>
              <span className="text-[10px] text-zinc-600 font-mono">{item.short_id}</span>
              {item.render_error && (
                <span className="text-[10px] text-red-400 truncate max-w-[120px]">{item.render_error}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

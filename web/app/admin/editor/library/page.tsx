/**
 * /admin/editor/library — Footage Hub
 *
 * Per Brandon's standing complaint (2026-04 GPT chats):
 *   "I need to see the current full footage of filming no matter if its raw,
 *    edited, or approved in flashflow. Like all stages need to be transparent
 *    and it should be the hub where the footage lives."
 *
 * One page that shows EVERY asset across EVERY stage with filters.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../../components/AdminPageLayout';
import { Film, Search, Filter, Plus, ExternalLink, RefreshCw } from 'lucide-react';

interface JobAsset {
  kind: 'raw' | 'broll' | 'product' | 'music';
  path: string;
  name: string;
}

interface Job {
  id: string;
  title: string;
  mode: string;
  status: string;
  output_url: string | null;
  preview_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  mode_options?: { platform?: string; notes?: string };
  assets?: JobAsset[];
}

type Stage = 'all' | 'raw' | 'in_progress' | 'edited' | 'approved' | 'published' | 'failed';

const STAGE_LABELS: Record<Stage, string> = {
  all: 'All',
  raw: 'Raw',
  in_progress: 'In progress',
  edited: 'Edited',
  approved: 'Approved',
  published: 'Published',
  failed: 'Failed',
};

const STAGE_BADGE: Record<Stage, string> = {
  all: 'bg-zinc-700 text-zinc-200',
  raw: 'bg-blue-900/60 text-blue-200',
  in_progress: 'bg-amber-900/60 text-amber-200',
  edited: 'bg-purple-900/60 text-purple-200',
  approved: 'bg-green-900/60 text-green-200',
  published: 'bg-teal-900/60 text-teal-200',
  failed: 'bg-red-900/60 text-red-200',
};

function jobStage(job: Job): Stage {
  if (job.status === 'failed') return 'failed';
  if (job.status === 'completed') {
    // Could add: published flag if posted to TikTok / YT
    return 'edited';
  }
  if (['uploading', 'transcribing', 'building_timeline', 'rendering'].includes(job.status)) {
    return 'in_progress';
  }
  // status === 'draft' OR no rendered output → raw
  return 'raw';
}

const PLATFORM_LABEL: Record<string, string> = {
  tiktok_shop: 'TikTok Shop',
  tiktok: 'TikTok',
  yt_shorts: 'YT Shorts',
  ig_reels: 'IG Reels',
  yt_long: 'YouTube',
};

const MODE_LABEL: Record<string, string> = {
  quick: 'Quick Cut',
  hook: 'Punchy Hook',
  ugc: 'Shop Demo',
  talking_head: 'Talking Head',
};

export default function LibraryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<Stage>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchJobs = async () => {
    setLoading(true);
    try {
      // Hit the existing /api/editor/jobs which returns up to 50 most recent for the user.
      // For full library we'd want a dedicated /library endpoint that includes assets — TODO.
      const res = await fetch('/api/editor/jobs', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        setJobs(j.jobs ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (stageFilter !== 'all' && jobStage(j) !== stageFilter) return false;
      if (platformFilter !== 'all' && j.mode_options?.platform !== platformFilter) return false;
      if (search && !j.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [jobs, stageFilter, platformFilter, search]);

  const counts: Record<Stage, number> = useMemo(() => {
    const acc: Record<Stage, number> = {
      all: jobs.length, raw: 0, in_progress: 0, edited: 0, approved: 0, published: 0, failed: 0,
    };
    for (const j of jobs) acc[jobStage(j)] += 1;
    return acc;
  }, [jobs]);

  return (
    <AdminPageLayout title="Footage Hub" subtitle="Every clip, every stage, every project — one view.">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Link
          href="/admin/editor/new"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="w-4 h-4" /> New Edit
        </Link>
        <button
          onClick={fetchJobs}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stage filter chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => {
          const active = stageFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full transition ${active ? 'ring-1 ring-teal-400 ' + STAGE_BADGE[s] : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}
            >
              {STAGE_LABELS[s]} <span className="opacity-60">({counts[s]})</span>
            </button>
          );
        })}
      </div>

      {/* Platform filter + search */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
        >
          <option value="all">All platforms</option>
          {Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-zinc-100"
          />
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-10 text-center">
          <Film className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
          <div className="text-zinc-300 font-medium mb-1">Nothing matches your filters</div>
          <div className="text-sm text-zinc-500">Try clearing filters or upload your first clip.</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((j) => {
            const stage = jobStage(j);
            return (
              <Link
                key={j.id}
                href={`/admin/editor/${j.id}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 p-4 flex gap-4 items-center"
              >
                {/* Thumbnail */}
                {j.preview_url || j.output_url ? (
                  <video
                    src={j.preview_url || j.output_url || undefined}
                    className="w-24 h-32 rounded bg-zinc-950 object-cover flex-shrink-0"
                    muted
                  />
                ) : (
                  <div className="w-24 h-32 rounded bg-zinc-950 flex items-center justify-center flex-shrink-0">
                    <Film className="w-6 h-6 text-zinc-700" />
                  </div>
                )}

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <div className="font-medium text-zinc-100 truncate">{j.title || 'Untitled Edit'}</div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STAGE_BADGE[stage]}`}>{STAGE_LABELS[stage]}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-zinc-500 flex-wrap">
                    <span>{MODE_LABEL[j.mode] || j.mode}</span>
                    {j.mode_options?.platform && <span>{PLATFORM_LABEL[j.mode_options.platform] || j.mode_options.platform}</span>}
                    <span>{new Date(j.created_at).toLocaleDateString()}</span>
                    {j.error && <span className="text-red-400 truncate max-w-xs">{j.error}</span>}
                  </div>
                  {j.mode_options?.notes && (
                    <div className="mt-1 text-[11px] text-zinc-500 italic line-clamp-1">"{j.mode_options.notes}"</div>
                  )}
                </div>

                {/* Action */}
                {j.output_url && (
                  <a
                    href={j.output_url}
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    rel="noopener"
                    className="text-teal-400 hover:text-teal-300 flex-shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-[11px] text-zinc-600">
        Tip: every stage of every clip lives here. Filter by stage to see only what's ready to post (Approved) or what needs your review (Edited).
      </div>
    </AdminPageLayout>
  );
}

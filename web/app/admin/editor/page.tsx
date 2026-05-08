'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../components/AdminPageLayout';
import { Plus, Film, RefreshCw, Library, FileText, Trash2, Play } from 'lucide-react';

interface ModeOptions {
  platform?: string;
  notes?: string;
  caption_style?: string;
  pace?: string;
}

interface JobRow {
  id: string;
  title: string;
  mode: string;
  mode_options: ModeOptions | null;
  status: string;
  error: string | null;
  output_url: string | null;
  preview_url: string | null;
  raw_url: string | null;
  assets: unknown[] | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-300',
  uploading: 'bg-blue-900/60 text-blue-200',
  queued: 'bg-cyan-900/60 text-cyan-200',
  transcribing: 'bg-purple-900/60 text-purple-200',
  planning: 'bg-fuchsia-900/60 text-fuchsia-200',
  building_timeline: 'bg-indigo-900/60 text-indigo-200',
  rendering: 'bg-amber-900/60 text-amber-200',
  completed: 'bg-green-900/60 text-green-200',
  failed: 'bg-red-900/60 text-red-200',
};

const MODE_LABEL: Record<string, string> = {
  quick: 'Quick Cut',
  hook: 'Punchy Hook',
  ugc: 'Shop Demo',
  talking_head: 'Clean Talking Head',
};

const PLATFORM_LABEL: Record<string, string> = {
  tiktok_shop: 'TikTok Shop',
  tiktok: 'TikTok',
  yt_shorts: 'YT Shorts',
  yt_long: 'YouTube',
  ig_reels: 'IG Reels',
};

export default function EditorListPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    setLoading(true);
    try {
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

  return (
    <AdminPageLayout title="AI Video Editor" subtitle="Upload raw footage, pick a mode, download a finished 9:16 MP4.">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Link
          href="/admin/editor/new"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-500 px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="w-4 h-4" /> New Edit
        </Link>
        <Link
          href="/admin/editor/library"
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
        >
          <Library className="w-3.5 h-3.5" /> Footage Hub
        </Link>
        <button
          onClick={fetchJobs}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm text-zinc-200"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-10 text-center">
          <Film className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
          <div className="text-zinc-300 font-medium mb-1">No edit jobs yet</div>
          <div className="text-sm text-zinc-500 mb-4">Upload your first clip to get started.</div>
          <Link href="/admin/editor/new" className="text-teal-400 hover:text-teal-300 text-sm">Create a new edit →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const isDraft = j.status === 'draft';
            const hasUpload = !!j.raw_url;
            const platform = j.mode_options?.platform ? PLATFORM_LABEL[j.mode_options.platform] : null;
            const notes = j.mode_options?.notes;
            const assetsCount = Array.isArray(j.assets) ? j.assets.length : 0;
            const href = isDraft && !hasUpload ? `/admin/editor/new?id=${j.id}` : `/admin/editor/${j.id}`;
            return (
              <Link
                key={j.id}
                href={href}
                className="block bg-zinc-900/60 border border-zinc-800 hover:border-teal-700 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-zinc-100 truncate">{j.title}</div>
                      {isDraft && !hasUpload && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 uppercase">
                          <FileText className="w-3 h-3" />
                          Resume
                        </span>
                      )}
                      {j.output_url && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 uppercase">
                          <Play className="w-3 h-3" />
                          Ready
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1.5 flex-wrap">
                      <span className="text-zinc-300">{MODE_LABEL[j.mode] ?? j.mode}</span>
                      {platform && <><span className="text-zinc-700">·</span><span>{platform}</span></>}
                      {hasUpload && <><span className="text-zinc-700">·</span><span className="text-emerald-400">video uploaded</span></>}
                      {!hasUpload && isDraft && <><span className="text-zinc-700">·</span><span className="text-amber-400">no video yet</span></>}
                      {assetsCount > 0 && <><span className="text-zinc-700">·</span><span>{assetsCount} extras</span></>}
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-500">{new Date(j.created_at).toLocaleString()}</span>
                    </div>
                    {notes && (
                      <div className="text-xs text-zinc-500 mt-1.5 line-clamp-2">
                        <span className="text-zinc-600">notes:</span> {notes}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full uppercase tracking-wide ${STATUS_STYLES[j.status] ?? 'bg-zinc-800 text-zinc-300'}`}>
                    {j.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {j.error && <div className="text-xs text-red-400 mt-2 line-clamp-2">{j.error}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </AdminPageLayout>
  );
}

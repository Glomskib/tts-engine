'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../components/AdminPageLayout';
import {
  Film, Upload, Search, Filter, RefreshCw, Loader2, Play, CheckCircle2,
  AlertTriangle, Clock, Zap, Archive, X, ChevronDown, FileVideo,
  Monitor, Bot, User, Settings, MoreHorizontal, Eye,
} from 'lucide-react';
import {
  FOOTAGE_STAGE_LABELS, FOOTAGE_STAGE_COLORS, FOOTAGE_STAGE_GROUPS,
  FOOTAGE_SOURCE_LABELS, FOOTAGE_UPLOADED_BY_LABELS,
  type FootageStage, type FootageSourceType,
} from '@/lib/footage/constants';
import type { FootageItem } from '@/lib/footage/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number | null): string {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  if (b < 1024 ** 3)   return `${(b / 1024 ** 2).toFixed(1)}MB`;
  return `${(b / 1024 ** 3).toFixed(2)}GB`;
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

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

const UPLOADED_BY_ICON: Record<string, React.ReactNode> = {
  user:      <User className="w-3 h-3" />,
  admin:     <Settings className="w-3 h-3" />,
  miles_bot: <Bot className="w-3 h-3" />,
  flash_bot: <Bot className="w-3 h-3" />,
  system:    <Zap className="w-3 h-3" />,
};

// ─── Stage Badge ──────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: FootageStage }) {
  const c = FOOTAGE_STAGE_COLORS[stage];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${stage === 'auto_edit_processing' ? 'animate-pulse' : ''}`} />
      {FOOTAGE_STAGE_LABELS[stage]}
    </span>
  );
}

// ─── Footage Card ─────────────────────────────────────────────────────────────

function FootageCard({ item, onAutoEdit }: { item: FootageItem; onAutoEdit: (id: string) => void }) {
  const [queueing, setQueueing] = useState(false);
  const isEditStage = ['auto_edit_queued', 'auto_edit_processing'].includes(item.stage);
  const isComplete  = ['auto_edit_complete', 'approved', 'draft_ready', 'posted'].includes(item.stage);
  const canAutoEdit = item.auto_edit_eligible &&
    ['raw_uploaded', 'ready_for_edit', 'auto_edit_complete', 'needs_review'].includes(item.stage);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-all group">
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] bg-zinc-800 max-h-36 overflow-hidden">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileVideo className="w-8 h-8 text-zinc-700" />
          </div>
        )}
        {/* Stage overlay */}
        {isEditStage && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
          </div>
        )}
        {isComplete && item.storage_url && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Play className="w-8 h-8 text-white" />
          </div>
        )}
        {/* Source badge */}
        <div className="absolute top-2 left-2">
          <span className="text-[9px] bg-black/60 text-zinc-300 px-1.5 py-0.5 rounded font-medium">
            {FOOTAGE_SOURCE_LABELS[item.source_type] || item.source_type}
          </span>
        </div>
        {/* Uploaded by */}
        <div className="absolute top-2 right-2 text-zinc-400">
          {UPLOADED_BY_ICON[item.uploaded_by] || <User className="w-3 h-3" />}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-medium text-zinc-200 truncate" title={item.original_filename}>
          {item.original_filename}
        </p>

        <StageBadge stage={item.stage} />

        <div className="flex items-center justify-between text-[10px] text-zinc-600">
          <span>{formatDuration(item.duration_sec)}</span>
          <span>{formatBytes(item.byte_size)}</span>
        </div>

        <p className="text-[10px] text-zinc-600">{timeAgo(item.created_at)}</p>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          <Link
            href={`/admin/footage/${item.id}`}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Eye className="w-3 h-3" /> View
          </Link>
          {canAutoEdit && (
            <button
              onClick={async () => {
                setQueueing(true);
                await onAutoEdit(item.id);
                setQueueing(false);
              }}
              disabled={queueing}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors disabled:opacity-50"
            >
              {queueing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {queueing ? '...' : 'Auto Edit'}
            </button>
          )}
          {!item.auto_edit_eligible && item.stage === 'raw_uploaded' && (
            <span className="flex-1 text-center text-[10px] text-zinc-600 italic">Edit locked</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Upload Drop Zone ─────────────────────────────────────────────────────────

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    if (!files.length) return;
    setUploading(true);

    try {
      const fileArr = Array.from(files).slice(0, 6);
      const urlRes = await fetch('/api/creator/upload-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: fileArr.map(f => ({ filename: f.name, content_type: f.type || 'video/mp4', size_bytes: f.size })),
          source_type: 'direct_upload',
        }),
      });
      const urlJson = await urlRes.json();
      if (!urlJson.ok) throw new Error(urlJson.error);

      await Promise.all(
        urlJson.data.uploads.map(async (u: any, i: number) => {
          await fetch(u.signed_url, {
            method: 'PUT',
            headers: { 'Content-Type': fileArr[i].type || 'video/mp4' },
            body: fileArr[i],
          });
        })
      );
      onUploaded();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 py-6 cursor-pointer transition-all ${
        dragging ? 'border-teal-400 bg-teal-500/5' : 'border-zinc-700 hover:border-zinc-600'
      }`}
    >
      <input ref={inputRef} type="file" accept="video/*" multiple className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)} />
      {uploading ? (
        <><Loader2 className="w-6 h-6 text-teal-400 animate-spin" /><p className="text-sm text-zinc-400">Uploading...</p></>
      ) : (
        <><Upload className="w-6 h-6 text-zinc-600" /><p className="text-sm text-zinc-400">Drop clips here or click to upload</p><p className="text-xs text-zinc-600">Up to 6 files · mp4, mov, webm</p></>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STAGE_FILTER_GROUPS = [
  { label: 'All',       value: '' },
  { label: 'Raw',       value: 'raw_uploaded' },
  { label: 'Editing',   value: 'auto_edit_queued,auto_edit_processing,auto_edit_complete' },
  { label: 'Review',    value: 'needs_review,approved' },
  { label: 'Published', value: 'draft_ready,posted' },
  { label: 'Failed',    value: 'failed' },
  { label: 'Archived',  value: 'archived' },
];

export default function FootageHubPage() {
  const [items, setItems]         = useState<FootageItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [stageFilter, setStage]   = useState('');
  const [sourceFilter, setSource] = useState('');
  const [page, setPage]           = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const LIMIT = 48;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
    if (stageFilter) params.set('stage', stageFilter);
    if (sourceFilter) params.set('source_type', sourceFilter);
    if (search) params.set('q', search);

    const res = await fetch(`/api/footage?${params}`);
    const json = await res.json();
    if (json.ok) {
      setItems(json.data.items);
      setTotal(json.data.total);
    }
    setLoading(false);
  }, [stageFilter, sourceFilter, search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const handleAutoEdit = async (footageId: string) => {
    await fetch(`/api/footage/${footageId}/auto-edit`, { method: 'POST' });
    load(true);
  };

  const hasActive = items.some(i => ['auto_edit_queued', 'auto_edit_processing', 'preprocessing'].includes(i.stage));

  return (
    <AdminPageLayout
      title="Footage Hub"
      subtitle="Single source of truth for all your footage and media assets"
      maxWidth="full"
      headerActions={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <div onClick={() => setAutoRefresh(p => !p)}
              className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${autoRefresh ? 'bg-teal-600' : 'bg-zinc-700'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${autoRefresh ? 'left-4' : 'left-0.5'}`} />
            </div>
            Live
          </label>
          <Link href="/admin/creator/clip-studio"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-500 transition-colors">
            <Zap className="w-4 h-4" /> Clip Studio
          </Link>
        </div>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Assets',   value: total,                                                  color: 'text-zinc-300' },
          { label: 'Raw Uploads',    value: items.filter(i => i.stage === 'raw_uploaded').length,   color: 'text-zinc-400' },
          { label: 'Editing',        value: items.filter(i => ['auto_edit_queued','auto_edit_processing'].includes(i.stage)).length, color: 'text-teal-400' },
          { label: 'Ready to Post',  value: items.filter(i => ['approved','draft_ready'].includes(i.stage)).length, color: 'text-green-400' },
          { label: 'Posted',         value: items.filter(i => i.stage === 'posted').length,         color: 'text-pink-400'  },
          { label: 'Failed',         value: items.filter(i => i.stage === 'failed').length,         color: 'text-red-400'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-[10px] text-zinc-600 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Upload zone */}
      <UploadZone onUploaded={() => load(true)} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by filename..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        {/* Stage filter */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {STAGE_FILTER_GROUPS.map(g => (
            <button key={g.value}
              onClick={() => { setStage(g.value); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                stageFilter === g.value ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={e => { setSource(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none"
        >
          <option value="">All sources</option>
          <option value="clip_studio">Clip Studio</option>
          <option value="direct_upload">Direct Upload</option>
          <option value="google_drive">Google Drive</option>
          <option value="ingestion">Ingestion</option>
          <option value="render_output">Render Output</option>
          <option value="bot_upload">Bot Upload</option>
        </select>

        <button onClick={() => load(true)} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Film className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">No footage yet</p>
          <p className="text-zinc-600 text-sm mt-1">Upload clips above or use Clip Studio to get started</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {items.map(item => (
              <FootageCard key={item.id} item={item} onAutoEdit={handleAutoEdit} />
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-zinc-500">Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                  className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                  Previous
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}
                  className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminPageLayout>
  );
}

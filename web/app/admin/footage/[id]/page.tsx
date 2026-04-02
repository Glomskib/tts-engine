'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import AdminPageLayout from '../../components/AdminPageLayout';
import {
  ArrowLeft, Film, Zap, CheckCircle2, AlertTriangle, Clock,
  Loader2, Play, Copy, Check, ExternalLink, RefreshCw,
  FileVideo, Bot, User, Settings, ChevronRight, Activity,
  Monitor, Hash, Calendar,
} from 'lucide-react';
import {
  FOOTAGE_STAGE_LABELS, FOOTAGE_STAGE_COLORS,
  FOOTAGE_STAGE_TRANSITIONS, canTransitionFootage,
  type FootageStage,
} from '@/lib/footage/constants';
import type { FootageItemWithRelations, FootageEvent } from '@/lib/footage/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, unit: string) {
  return v != null ? `${v}${unit}` : '—';
}
function formatBytes(b: number | null): string {
  if (!b) return '—';
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)}KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)}MB`;
  return `${(b / 1024 ** 3).toFixed(2)}GB`;
}
function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function tsAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StageBadge({ stage, size = 'sm' }: { stage: FootageStage; size?: 'sm' | 'lg' }) {
  const c = FOOTAGE_STAGE_COLORS[stage];
  const sizeClass = size === 'lg' ? 'text-xs px-3 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${sizeClass} ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot} ${stage === 'auto_edit_processing' ? 'animate-pulse' : ''}`} />
      {FOOTAGE_STAGE_LABELS[stage]}
    </span>
  );
}

// ─── Stage Timeline ───────────────────────────────────────────────────────────

const STAGE_PIPELINE: FootageStage[] = [
  'raw_uploaded', 'ready_for_edit', 'auto_edit_queued',
  'auto_edit_processing', 'auto_edit_complete', 'needs_review',
  'approved', 'draft_ready', 'posted',
];

function StageTimeline({ current }: { current: FootageStage }) {
  const ci = STAGE_PIPELINE.indexOf(current);
  return (
    <div className="flex items-center gap-0">
      {STAGE_PIPELINE.map((s, i) => {
        const done    = ci > i;
        const active  = ci === i;
        const pending = ci < i;
        const c       = FOOTAGE_STAGE_COLORS[s];
        return (
          <div key={s} className="flex items-center">
            <div className={`flex flex-col items-center ${i > 0 ? 'ml-0' : ''}`}>
              <div className={`w-3 h-3 rounded-full flex-shrink-0 border-2 transition-all ${
                active  ? `${c.dot} border-white/50 shadow-lg` :
                done    ? 'bg-teal-500 border-teal-400' :
                          'bg-zinc-800 border-zinc-700'
              }`} />
              <span className={`text-[8px] mt-1 text-center max-w-[48px] leading-tight ${
                active ? c.text : done ? 'text-teal-500' : 'text-zinc-700'
              }`}>{FOOTAGE_STAGE_LABELS[s].replace(' ', '\n')}</span>
            </div>
            {i < STAGE_PIPELINE.length - 1 && (
              <div className={`w-6 h-px mb-4 ${done ? 'bg-teal-500' : 'bg-zinc-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: FootageEvent }) {
  const icons: Record<string, React.ReactNode> = {
    upload:            <Upload className="w-3 h-3" />,
    stage_change:      <ChevronRight className="w-3 h-3" />,
    auto_edit_queued:  <Zap className="w-3 h-3" />,
    deleted:           <AlertTriangle className="w-3 h-3" />,
  };
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-500 mt-0.5">
        {icons[event.event_type] || <Activity className="w-3 h-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-300 font-medium">{event.event_type.replace(/_/g, ' ')}</p>
        {event.from_stage && event.to_stage && (
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {FOOTAGE_STAGE_LABELS[event.from_stage]} → {FOOTAGE_STAGE_LABELS[event.to_stage]}
          </p>
        )}
        {Object.keys(event.details || {}).length > 0 && (
          <p className="text-[10px] text-zinc-700 mt-0.5 truncate">
            {JSON.stringify(event.details).slice(0, 80)}
          </p>
        )}
      </div>
      <span className="text-[10px] text-zinc-600 flex-shrink-0">{tsAgo(event.created_at)}</span>
    </div>
  );
}

// Lazy import to avoid build issues
const Upload = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FootageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<FootageItemWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/footage/${id}`);
    const json = await res.json();
    if (json.ok) setItem(json.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Poll while active
  useEffect(() => {
    if (!item) return;
    const active = ['auto_edit_queued', 'auto_edit_processing', 'preprocessing'].includes(item.stage);
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [item?.stage]);

  const handleAutoEdit = async () => {
    setQueueing(true);
    try {
      await fetch(`/api/footage/${id}/auto-edit`, { method: 'POST' });
      await load();
    } finally { setQueueing(false); }
  };

  const handleAdvanceStage = async (toStage: FootageStage) => {
    setAdvancing(true);
    try {
      await fetch(`/api/footage/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: toStage }),
      });
      await load();
    } finally { setAdvancing(false); }
  };

  const copyUrl = () => {
    if (item?.storage_url) {
      navigator.clipboard.writeText(item.storage_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return (
    <AdminPageLayout title="Footage" maxWidth="2xl">
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-zinc-600 animate-spin" />
      </div>
    </AdminPageLayout>
  );

  if (!item) return (
    <AdminPageLayout title="Footage" maxWidth="2xl">
      <div className="text-center py-20 text-zinc-500">Footage item not found.</div>
    </AdminPageLayout>
  );

  const canAutoEdit = item.auto_edit_eligible &&
    ['raw_uploaded', 'ready_for_edit', 'auto_edit_complete', 'needs_review'].includes(item.stage);

  const nextStages = FOOTAGE_STAGE_TRANSITIONS[item.stage] || [];

  return (
    <AdminPageLayout
      title="Footage Detail"
      subtitle={item.original_filename}
      maxWidth="2xl"
      headerActions={
        <Link href="/admin/footage" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Footage Hub
        </Link>
      }
    >
      {/* Stage timeline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 overflow-x-auto">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Lifecycle</p>
        <StageTimeline current={item.stage} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Preview + main info */}
        <div className="lg:col-span-2 space-y-4">

          {/* Video player / preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {item.storage_url ? (
              <video
                src={item.storage_url}
                controls
                className="w-full max-h-80 bg-black"
                poster={item.thumbnail_url || undefined}
              />
            ) : item.thumbnail_url ? (
              <img src={item.thumbnail_url} alt="" className="w-full max-h-80 object-contain bg-black" />
            ) : (
              <div className="h-48 flex items-center justify-center bg-zinc-900">
                <FileVideo className="w-12 h-12 text-zinc-700" />
              </div>
            )}
          </div>

          {/* Stage + actions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <StageBadge stage={item.stage} size="lg" />
              <button onClick={load} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Render job progress */}
            {item.render_job && ['auto_edit_queued', 'auto_edit_processing'].includes(item.stage) && (
              <div className="mb-4 p-3 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    {item.render_job.node_id || 'Waiting for Mac mini...'}
                  </span>
                  <span className="font-bold text-zinc-300">{item.render_job.progress_pct}%</span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.max(2, item.render_job.progress_pct)}%` }}
                  />
                </div>
                {item.render_job.progress_message && (
                  <p className="text-[10px] text-zinc-600 mt-1">{item.render_job.progress_message}</p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {canAutoEdit && (
                <button
                  onClick={handleAutoEdit}
                  disabled={queueing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-500 transition-colors disabled:opacity-50"
                >
                  {queueing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {queueing ? 'Queuing...' : 'Auto Edit'}
                </button>
              )}

              {/* Manual stage advances */}
              {nextStages.filter(s => !['archived', 'failed'].includes(s)).map(s => (
                <button
                  key={s}
                  onClick={() => handleAdvanceStage(s)}
                  disabled={advancing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  <ChevronRight className="w-3 h-3" />
                  Mark as {FOOTAGE_STAGE_LABELS[s]}
                </button>
              ))}

              {item.storage_url && (
                <>
                  <button onClick={copyUrl}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      copied ? 'bg-green-600 text-white border-green-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy URL'}
                  </button>
                  <a href={item.storage_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors">
                    <ExternalLink className="w-3 h-3" /> Open
                  </a>
                </>
              )}
            </div>

            {!item.auto_edit_eligible && (
              <p className="text-xs text-zinc-600 mt-3 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Auto-edit is not enabled for your account.
                <Link href="/admin/billing" className="text-zinc-400 underline ml-1">Upgrade</Link>
              </p>
            )}
          </div>

          {/* AI Analysis */}
          {item.ai_analysis && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">AI Analysis</p>
              <div className="space-y-3 text-sm">
                {item.ai_analysis.hook && (
                  <div><p className="text-[10px] text-zinc-600 mb-0.5">Hook</p>
                    <p className="text-zinc-200 font-medium">"{item.ai_analysis.hook}"</p></div>
                )}
                {item.ai_analysis.caption && (
                  <div><p className="text-[10px] text-zinc-600 mb-0.5">Caption</p>
                    <p className="text-zinc-300 text-xs">{item.ai_analysis.caption}</p></div>
                )}
                {item.ai_analysis.hashtags?.length && (
                  <div className="flex flex-wrap gap-1">
                    {item.ai_analysis.hashtags.map((h, i) => (
                      <span key={i} className="text-[10px] bg-zinc-800 text-teal-300 px-2 py-0.5 rounded-full border border-teal-800/40">{h}</span>
                    ))}
                  </div>
                )}
                {item.ai_analysis.content_angle && (
                  <p className="text-xs text-zinc-500 italic">{item.ai_analysis.content_angle}</p>
                )}
              </div>
            </div>
          )}

          {/* Transcript */}
          {item.transcript_text && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Transcript</p>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{item.transcript_text}</p>
            </div>
          )}
        </div>

        {/* Right: Metadata + relations + events */}
        <div className="space-y-4">

          {/* Metadata */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Details</p>
            <dl className="space-y-2">
              {[
                { label: 'Source',    value: item.source_type?.replace('_', ' ') },
                { label: 'Uploaded by', value: item.uploaded_by?.replace('_', ' ') },
                { label: 'Duration',  value: formatDuration(item.duration_sec) },
                { label: 'File size', value: formatBytes(item.byte_size) },
                { label: 'Resolution', value: item.resolution || '—' },
                { label: 'Codec',     value: item.codec || '—' },
                { label: 'MIME',      value: item.mime_type || '—' },
                { label: 'Version',   value: String(item.version_num) },
                { label: 'Created',   value: tsAgo(item.created_at) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-[10px] text-zinc-600">{label}</dt>
                  <dd className="text-[11px] text-zinc-300 font-medium text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Linked content item */}
          {item.content_item && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Content Item</p>
              <Link href={`/admin/content-items/${item.content_item.id}`}
                className="flex items-center justify-between p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors">
                <div>
                  <p className="text-sm font-medium text-zinc-200 truncate">{item.content_item.title}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {item.content_item.short_id} · {item.content_item.status}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </Link>
            </div>
          )}

          {/* Version chain */}
          {item.versions && item.versions.length > 1 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Versions</p>
              <div className="space-y-2">
                {item.versions.map(v => (
                  <Link key={v.id} href={`/admin/footage/${v.id}`}
                    className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                      v.id === item.id ? 'bg-zinc-700 border border-zinc-600' : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}>
                    <div>
                      <p className="text-xs font-medium text-zinc-300">v{v.version_num}</p>
                      <p className="text-[9px] text-zinc-600 truncate">{v.original_filename}</p>
                    </div>
                    <StageBadge stage={v.stage as FootageStage} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Parent footage */}
          {item.parent_footage && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Source Clip</p>
              <Link href={`/admin/footage/${item.parent_footage.id}`}
                className="flex items-center gap-3 p-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors">
                <FileVideo className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <span className="text-xs text-zinc-300 truncate">{item.parent_footage.original_filename}</span>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 ml-auto" />
              </Link>
            </div>
          )}

          {/* Event log */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Activity</p>
            {item.events?.length ? (
              <div>{item.events.slice(0, 15).map(e => <EventRow key={e.id} event={e} />)}</div>
            ) : (
              <p className="text-xs text-zinc-600 text-center py-4">No events yet</p>
            )}
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
}

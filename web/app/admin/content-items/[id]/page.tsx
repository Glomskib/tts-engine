'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Copy, Check, Loader2, ExternalLink,
  FileText, Clock, ChevronRight, Calendar, Send,
  Mic, Scissors, BarChart3, Package, Sparkles,
} from 'lucide-react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useToast } from '@/contexts/ToastContext';
import type { ContentItem, ContentItemStatus, ContentItemEvent } from '@/lib/content-items/types';
import { CONTENT_ITEM_STATUSES } from '@/lib/content-items/types';
import { getNextAction, getActionButtonClasses } from '@/lib/content-items/nextAction';
import DriveFolderButton from '@/components/DriveFolderButton';
import RawVideoUpload from '@/components/RawVideoUpload';

// ── Status display config ─────────────────────────────────────────

const STATUS_CONFIG: Record<ContentItemStatus, { label: string; color: string; bg: string }> = {
  briefing:        { label: 'Briefing',        color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
  scripted:        { label: 'Scripted',        color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  ready_to_record: { label: 'Ready to Record', color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30' },
  recorded:        { label: 'Recorded',        color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  editing:         { label: 'Editing',         color: 'text-amber-400',  bg: 'bg-amber-500/15 border-amber-500/30' },
  scheduled:       { label: 'Scheduled',       color: 'text-cyan-400',   bg: 'bg-cyan-500/15 border-cyan-500/30' },
  ready_to_post:   { label: 'Ready to Post',   color: 'text-teal-400',   bg: 'bg-teal-500/15 border-teal-500/30' },
  posted:          { label: 'Posted',          color: 'text-green-400',  bg: 'bg-green-500/15 border-green-500/30' },
};

const EVENT_LABELS: Record<string, { label: string; icon: typeof Clock }> = {
  created:          { label: 'Created',          icon: Sparkles },
  status_changed:   { label: 'Status Changed',   icon: ChevronRight },
  script_generated: { label: 'Script Generated', icon: FileText },
  scheduled:        { label: 'Scheduled',        icon: Calendar },
  posted:           { label: 'Posted',           icon: Send },
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Status progress bar ───────────────────────────────────────────

function StatusProgress({ status }: { status: ContentItemStatus }) {
  const idx = CONTENT_ITEM_STATUSES.indexOf(status);
  return (
    <div className="flex gap-1">
      {CONTENT_ITEM_STATUSES.map((s, i) => {
        const config = STATUS_CONFIG[s];
        const active = i <= idx;
        return (
          <div key={s} className="flex-1 group relative">
            <div
              className={`h-2 rounded-full transition-colors ${active ? config.bg.split(' ')[0] : 'bg-zinc-800'}`}
              style={{ opacity: active ? 1 : 0.3 }}
            />
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-zinc-500 opacity-0 group-hover:opacity-100 transition pointer-events-none">
              {config.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Event Timeline ────────────────────────────────────────────────

function EventTimeline({ events, loading }: { events: ContentItemEvent[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500 py-4">No events recorded yet.</p>;
  }
  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-3 top-2 bottom-2 w-px bg-zinc-800" />
      {events.map((evt) => {
        const config = EVENT_LABELS[evt.event_type] || { label: evt.event_type.replace(/_/g, ' '), icon: Clock };
        const Icon = config.icon;
        return (
          <div key={evt.id} className="relative flex items-start gap-3 py-2.5 pl-1">
            <div className="relative z-10 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <Icon size={10} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-200">{config.label}</span>
                {evt.from_value && evt.to_value && (
                  <span className="text-xs text-zinc-500">
                    {evt.from_value.replace(/_/g, ' ')} &rarr; {evt.to_value.replace(/_/g, ' ')}
                  </span>
                )}
                {!evt.from_value && evt.to_value && (
                  <span className="text-xs text-zinc-500">
                    &rarr; {evt.to_value.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-600 mt-0.5">{formatEventTime(evt.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function ContentItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showToast } = useToast();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [events, setEvents] = useState<ContentItemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-items/${id}`);
      const json = await res.json();
      if (json.ok && json.data) {
        setItem(json.data);
      } else {
        router.push('/admin/content-items');
      }
    } catch {
      router.push('/admin/content-items');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-items/${id}/events`);
      const json = await res.json();
      if (json.ok) setEvents(json.data || []);
    } catch { /* silent */ } finally {
      setEventsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchItem(); fetchEvents(); }, [fetchItem, fetchEvents]);

  const handleStatusChange = async (newStatus: string) => {
    if (!item || item.status === newStatus) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/content-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setItem(json.data);
        showToast({ message: `Status updated to ${STATUS_CONFIG[newStatus as ContentItemStatus]?.label || newStatus}`, type: 'success' });
        fetchEvents();
      } else {
        showToast({ message: json.error || 'Failed to update status', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!item) return null;

  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.briefing;
  const nextAction = getNextAction({
    id: item.id,
    status: item.status,
    product_id: item.product_id,
    drive_folder_id: item.drive_folder_id,
    transcript_text: item.transcript_text,
    editor_notes: item.editor_notes,
    editor_notes_status: item.editor_notes_status,
    final_video_url: item.final_video_url,
    caption: item.caption,
    has_brief: !!(item as unknown as Record<string, unknown>).latest_brief,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold" style={{ color: colors.text }}>{item.title}</h1>
            <p className="text-xs font-mono mt-1" style={{ color: colors.textMuted }}>{item.short_id}</p>
          </div>
          <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${statusConfig.bg} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Progress bar */}
        <StatusProgress status={item.status} />
      </div>

      {/* Next Action CTA */}
      <div
        className="rounded-xl p-4 space-y-2"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
          Next Step
        </p>
        <div className="flex items-center gap-3">
          {nextAction.href ? (
            <Link
              href={nextAction.href}
              className={`flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold transition-colors ${getActionButtonClasses(nextAction.variant)}`}
            >
              {nextAction.label}
            </Link>
          ) : (
            <button
              onClick={() => {
                if (nextAction.onClickType === 'mark_ready_to_post') {
                  handleStatusChange('ready_to_post');
                }
                // Other callback types handled inline or via navigation
              }}
              disabled={updating}
              className={`flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold transition-colors ${getActionButtonClasses(nextAction.variant)} disabled:opacity-50`}
            >
              {updating && <Loader2 size={14} className="animate-spin" />}
              {nextAction.label}
            </button>
          )}
        </div>
        {nextAction.reason && (
          <p className="text-xs" style={{ color: colors.textMuted }}>{nextAction.reason}</p>
        )}
      </div>

      {/* Two-column details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Core Info */}
        <div
          className="rounded-xl p-4 space-y-4"
          style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
        >
          <h2 className="text-sm font-semibold" style={{ color: colors.text }}>Details</h2>

          {/* Status selector */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Status</label>
            <select
              value={item.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updating}
              className="w-full min-h-[40px] rounded-lg text-sm px-3 py-2 border focus:outline-none focus:border-teal-500 disabled:opacity-50"
              style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5', borderColor: colors.border, color: colors.text }}
            >
              {CONTENT_ITEM_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          {/* Product */}
          {item.product_id && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Product</label>
              <div className="flex items-center gap-2">
                <Package size={14} className="text-zinc-500" />
                <span className="text-sm" style={{ color: colors.text }}>
                  {(item as unknown as Record<string, unknown>).product_name as string || item.product_id}
                </span>
              </div>
            </div>
          )}

          {/* Source */}
          {item.source_type && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Source</label>
              <span className="text-sm capitalize" style={{ color: colors.text }}>{item.source_type.replace(/_/g, ' ')}</span>
            </div>
          )}

          {/* Due date */}
          {item.due_at && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Due</label>
              <span className="text-sm" style={{ color: colors.text }}>{formatDate(item.due_at)}</span>
            </div>
          )}

          {/* Scheduled */}
          {item.scheduled_at && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Scheduled</label>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-cyan-400" />
                <span className="text-sm" style={{ color: colors.text }}>{formatDateTime(item.scheduled_at)}</span>
              </div>
            </div>
          )}

          {/* Posted */}
          {item.posted_at && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Posted</label>
              <div className="flex items-center gap-2">
                <Send size={14} className="text-green-400" />
                <span className="text-sm" style={{ color: colors.text }}>{formatDateTime(item.posted_at)}</span>
                {item.post_url && (
                  <a href={item.post_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Drive folder */}
          <DriveFolderButton
            contentItemId={item.id}
            driveFolderUrl={item.drive_folder_url}
            onFolderReady={(url, folderId) => setItem({ ...item, drive_folder_id: folderId, drive_folder_url: url })}
            className="w-full"
          />

          {/* Raw video upload */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: colors.textMuted }}>Raw Video</label>
            <RawVideoUpload
              contentItemId={item.id}
              currentUrl={item.raw_video_url}
              onUploadComplete={(url, path) => setItem({ ...item, raw_video_url: url, raw_video_storage_path: path })}
              onRemove={() => setItem({ ...item, raw_video_url: null, raw_video_storage_path: null })}
            />
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/pipeline?highlight=${item.id}`}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              <BarChart3 size={12} /> View in Board
            </Link>
            {item.scheduled_at && (
              <Link
                href="/admin/calendar"
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition"
              >
                <Calendar size={12} /> View in Planner
              </Link>
            )}
          </div>
        </div>

        {/* Right: Hook + Script */}
        <div
          className="rounded-xl p-4 space-y-4"
          style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
        >
          <h2 className="text-sm font-semibold" style={{ color: colors.text }}>Content</h2>

          {/* Hook */}
          {item.primary_hook && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>Hook</label>
                <CopyBtn text={item.primary_hook} />
              </div>
              <p className="text-sm font-medium" style={{ color: colors.text }}>
                &ldquo;{item.primary_hook}&rdquo;
              </p>
            </div>
          )}

          {/* Script */}
          {item.script_text && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>Script</label>
                <CopyBtn text={item.script_text} />
              </div>
              <div
                className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto rounded-lg p-3"
                style={{ backgroundColor: isDark ? '#18181b' : '#fafafa', color: colors.text }}
              >
                {item.script_text}
              </div>
            </div>
          )}

          {/* Creative notes */}
          {item.creative_notes && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Creative Notes</label>
              <p className="text-sm" style={{ color: colors.text }}>{item.creative_notes}</p>
            </div>
          )}

          {/* Caption */}
          {item.caption && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>Caption</label>
                <CopyBtn text={item.caption} />
              </div>
              <p className="text-sm" style={{ color: colors.text }}>{item.caption}</p>
            </div>
          )}

          {/* Hashtags */}
          {item.hashtags && item.hashtags.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: colors.textMuted }}>Hashtags</label>
              <p className="text-xs text-zinc-400">{item.hashtags.join(' ')}</p>
            </div>
          )}

          {/* No content yet */}
          {!item.primary_hook && !item.script_text && !item.caption && (
            <p className="text-sm text-zinc-500">No content written yet.</p>
          )}
        </div>
      </div>

      {/* Event Timeline */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: colors.text }}>Timeline</h2>
        <EventTimeline events={events} loading={eventsLoading} />
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-[10px]" style={{ color: colors.textMuted }}>
        <span>Created {formatEventTime(item.created_at)}</span>
        <span>Updated {formatEventTime(item.updated_at)}</span>
      </div>
    </div>
  );
}

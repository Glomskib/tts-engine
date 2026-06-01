'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, Sparkles, Loader2, Save, Check, AlertCircle,
  Power, FileText, Video, Globe,
} from 'lucide-react';

interface RecentItem {
  id: string;
  title: string | null;
  final_video_url: string | null;
  rendered_video_url: string | null;
  status: string | null;
  created_at: string;
  posted_at: string | null;
  post_url: string | null;
}

interface ScheduleResponse {
  ok: boolean;
  settings?: {
    daily_post_enabled: boolean;
    daily_post_target_time: string;
    daily_post_timezone: string;
  };
  pipeline?: { unused_scripts: number };
  recent?: RecentItem[];
  error?: string;
}

const COMMON_TZ = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function toHM(t: string): string {
  // "HH:MM:SS" -> "HH:MM"
  return (t || '').slice(0, 5);
}

function nextPostLabel(targetTime: string, enabled: boolean, hasScripts: boolean): string {
  if (!enabled) return 'Auto-pilot off';
  if (!hasScripts) return 'Paused — out of scripts';
  const hm = toHM(targetTime) || '08:00';
  return `Next post around ${hm} tomorrow`;
}

export default function AvatarSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('08:00');
  const [tz, setTz] = useState('America/New_York');
  const [unused, setUnused] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/avatars/${id}/schedule`, { credentials: 'include' });
        if (r.status === 401) {
          router.push('/login');
          return;
        }
        const j = (await r.json()) as ScheduleResponse;
        if (cancelled) return;
        if (!j.ok) {
          setError(j.error || 'Failed to load schedule');
          return;
        }
        setEnabled(!!j.settings?.daily_post_enabled);
        setTime(toHM(j.settings?.daily_post_target_time || '08:00:00'));
        setTz(j.settings?.daily_post_timezone || 'America/New_York');
        setUnused(j.pipeline?.unused_scripts ?? 0);
        setRecent(j.recent || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function save() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/avatars/${id}/schedule`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          daily_post_enabled: enabled,
          daily_post_target_time: time,
          daily_post_timezone: tz,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const nextLabel = useMemo(
    () => nextPostLabel(time, enabled, unused > 0),
    [time, enabled, unused],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link
          href={`/avatars/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to avatar
        </Link>

        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-400" /> Auto-pilot schedule
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            One fresh video per day, rendered overnight, ready before you wake up.
          </p>

          {/* Status strip */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={FileText}
              label="Scripts ready"
              value={`${unused}`}
              hint={unused === 0 ? 'Generate more' : 'in the queue'}
              tone={unused === 0 ? 'warn' : 'ok'}
            />
            <StatCard
              icon={Clock}
              label="Status"
              value={enabled ? 'On' : 'Off'}
              hint={nextLabel}
              tone={enabled ? 'ok' : 'muted'}
            />
            <StatCard
              icon={Globe}
              label="Local time"
              value={toHM(time)}
              hint={tz}
              tone="muted"
            />
          </div>

          {/* Toggle */}
          <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950 p-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1 w-5 h-5 accent-teal-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Power className={enabled ? 'w-4 h-4 text-teal-400' : 'w-4 h-4 text-zinc-500'} />
                  Post daily on auto-pilot
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Each morning the system picks your next script, renders the video, and queues it for posting.
                </div>
              </div>
            </label>
          </div>

          {/* Time + tz */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Target post time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
              />
            </Field>
            <Field label="Timezone">
              <select
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
              >
                {[...new Set([tz, ...COMMON_TZ])].map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Save row */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-sm font-semibold flex items-center gap-1.5 text-zinc-950"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save schedule
            </button>
            {savedAt && !saving && (
              <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {error && (
              <span className="text-xs text-red-300 inline-flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </span>
            )}
            <Link
              href={`/avatars/${id}/scripts/new`}
              className="ml-auto px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold flex items-center gap-1.5 border border-white/10"
            >
              <Sparkles className="w-4 h-4 text-teal-400" /> Generate more scripts
            </Link>
          </div>

          {unused < 3 && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                You only have {unused} script{unused === 1 ? '' : 's'} queued. Auto-pilot pauses
                when the queue runs dry — generate a fresh batch to keep posting.
              </span>
            </div>
          )}
        </div>

        {/* Recent auto-posts */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Video className="w-4 h-4 text-zinc-400" /> Last 7 days
          </h2>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-6 text-center text-xs text-zinc-500">
              No auto-posts yet. Once you flip the switch on, you&apos;ll see them stack up here.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {recent.map((item) => {
                const url = item.final_video_url || item.rendered_video_url || item.post_url || null;
                const dt = new Date(item.created_at);
                const label = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                return (
                  <a
                    key={item.id}
                    href={url || '#'}
                    target={url ? '_blank' : undefined}
                    rel={url ? 'noreferrer' : undefined}
                    className="group rounded-lg border border-white/10 bg-zinc-900 overflow-hidden hover:border-teal-500/50 transition"
                  >
                    <div className="aspect-[9/16] bg-zinc-800 flex items-center justify-center text-zinc-700 group-hover:text-teal-400">
                      {url ? <Video className="w-6 h-6" /> : <Loader2 className="w-5 h-5 animate-spin opacity-50" />}
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-[10px] text-zinc-500">{label}</div>
                      <div className="text-[11px] text-zinc-300 truncate">
                        {item.title || item.status || 'rendering'}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  hint: string;
  tone: 'ok' | 'warn' | 'muted';
}) {
  const ring =
    tone === 'ok'
      ? 'border-teal-500/40'
      : tone === 'warn'
        ? 'border-amber-500/40'
        : 'border-white/10';
  const text =
    tone === 'ok' ? 'text-teal-300' : tone === 'warn' ? 'text-amber-300' : 'text-zinc-300';
  return (
    <div className={`rounded-xl border ${ring} bg-zinc-950 px-3 py-3`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${text}`}>{value}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>
    </div>
  );
}

'use client';

/**
 * /avatars/[id]/schedule — auto-pilot control room.
 *
 * Four sections, top to bottom:
 *   1. Enable + timezone + multi-slot chips ("Daily auto-slots")
 *   2. Next 7 days grid (per-day, per-slot — auto/override/empty)
 *   3. Manual override form (script + date + slot)
 *   4. Recently made for this avatar (last 30 days, link to /admin/post/[id])
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Sparkles,
  Loader2,
  Save,
  Check,
  AlertCircle,
  Power,
  FileText,
  Video,
  Globe,
  Plus,
  X,
  CalendarPlus,
  ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────
interface LibraryItem {
  id: string;
  title: string | null;
  final_video_url: string | null;
  rendered_video_url: string | null;
  status: string | null;
  created_at: string;
  posted_at: string | null;
  post_url: string | null;
  primary_hook: string | null;
}

interface PlannedSlot {
  time: string; // HH:MM
  kind: 'auto' | 'override' | 'empty';
  script_id: string | null;
  script_hook: string | null;
  override_id?: string;
}

interface PlannedDay {
  date: string; // YYYY-MM-DD
  weekday: string;
  slots: PlannedSlot[];
}

interface AvailableScript {
  id: string;
  script_type: string;
  hook: string | null;
  preview: string;
}

interface ScheduleResponse {
  ok: boolean;
  settings?: {
    daily_post_enabled: boolean;
    daily_post_target_time: string;
    daily_post_target_times: string[];
    daily_post_timezone: string;
  };
  pipeline?: { unused_scripts: number; scripts_available_for_override: number };
  slots?: string[];
  next_7_days?: PlannedDay[];
  available_scripts?: AvailableScript[];
  library?: LibraryItem[];
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

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toHM(t: string): string {
  return (t || '').slice(0, 5);
}
function toHMS(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

export default function AvatarSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  // ─── Loading / save state ───────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Settings ──────────────────────────────────────────────────
  const [enabled, setEnabled] = useState(false);
  const [slots, setSlots] = useState<string[]>(['08:00']); // HH:MM
  const [newSlot, setNewSlot] = useState('12:00');
  const [tz, setTz] = useState('America/New_York');

  // ─── Pipeline / planning data ───────────────────────────────────
  const [unused, setUnused] = useState(0);
  const [next7, setNext7] = useState<PlannedDay[]>([]);
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);

  // ─── Override form ─────────────────────────────────────────────
  const [ovScriptId, setOvScriptId] = useState('');
  const [ovDate, setOvDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [ovTime, setOvTime] = useState('08:00');
  const [ovSubmitting, setOvSubmitting] = useState(false);
  const [ovError, setOvError] = useState<string | null>(null);

  // ─── Loader ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/avatars/${id}/schedule`, { credentials: 'include' });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const j = (await r.json()) as ScheduleResponse;
      if (!j.ok) {
        setError(j.error || 'Failed to load schedule');
        return;
      }
      setEnabled(!!j.settings?.daily_post_enabled);
      const incomingSlots =
        j.settings?.daily_post_target_times && j.settings.daily_post_target_times.length > 0
          ? j.settings.daily_post_target_times.map(toHM)
          : [toHM(j.settings?.daily_post_target_time || '08:00:00')];
      setSlots(incomingSlots);
      setTz(j.settings?.daily_post_timezone || 'America/New_York');
      setUnused(j.pipeline?.unused_scripts ?? 0);
      setNext7(j.next_7_days || []);
      setAvailableScripts(j.available_scripts || []);
      setLibrary(j.library || []);
      // Default override picker to the first available script if blank.
      // We use a functional setState so this effect doesn't depend on
      // ovScriptId — avoids a refetch loop when the user picks a script.
      setOvScriptId((prev) => {
        if (prev) return prev;
        return j.available_scripts && j.available_scripts[0] ? j.available_scripts[0].id : '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Slot management ───────────────────────────────────────────
  function addSlot() {
    if (!HHMM.test(newSlot)) {
      setError(`"${newSlot}" isn't a valid HH:MM time`);
      return;
    }
    if (slots.includes(newSlot)) {
      setError('That slot is already in the list');
      return;
    }
    if (slots.length >= 8) {
      setError('Max 8 slots per day');
      return;
    }
    setError(null);
    const next = [...slots, newSlot].sort();
    setSlots(next);
  }
  function removeSlot(s: string) {
    if (slots.length <= 1) {
      setError('Need at least one slot — disable auto-pilot instead');
      return;
    }
    setSlots(slots.filter((x) => x !== s));
  }

  // ─── Save settings ─────────────────────────────────────────────
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
          daily_post_target_times: slots.map(toHMS),
          daily_post_timezone: tz,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSavedAt(Date.now());
      // Reload to pick up the new planning grid.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ─── Override submit / cancel ──────────────────────────────────
  async function submitOverride() {
    if (!id) return;
    setOvError(null);
    if (!ovScriptId) {
      setOvError('Pick a script');
      return;
    }
    if (!ovDate || !HHMM.test(ovTime)) {
      setOvError('Pick a date and HH:MM time');
      return;
    }
    setOvSubmitting(true);
    try {
      // Build an ISO timestamp by interpreting the picked date+time in the
      // avatar's timezone. We send the wall-clock to the server as a UTC ISO
      // computed via the local browser tz then nudged into the target tz —
      // good enough for slot bucketing; the cron uses a ±30-min window.
      const localGuess = new Date(`${ovDate}T${ovTime}:00`);
      // If the browser tz differs from the avatar tz, correct.
      const correction = browserToTzOffsetMs(localGuess, tz);
      const scheduledFor = new Date(localGuess.getTime() + correction).toISOString();

      const r = await fetch(`/api/avatars/${id}/schedule/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ script_id: ovScriptId, scheduled_for: scheduledFor }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setOvError(e instanceof Error ? e.message : 'Schedule failed');
    } finally {
      setOvSubmitting(false);
    }
  }

  async function cancelOverride(overrideId: string) {
    if (!id) return;
    if (!confirm('Cancel this scheduled post?')) return;
    try {
      const r = await fetch(
        `/api/avatars/${id}/schedule/override?override_id=${encodeURIComponent(overrideId)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      alert('Cancel failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ─── Memoised UI bits ──────────────────────────────────────────
  const earliestSlot = useMemo(() => slots[0] || '08:00', [slots]);
  const slotsPerDay = slots.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link
          href={`/avatars/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to avatar
        </Link>

        {/* ═══ Section 1 — Auto-pilot core settings ═══════════════ */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-400" /> Auto-pilot schedule
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            One or more slots per day. The system picks the next unused script for each slot —
            unless you manually scheduled a specific one.
          </p>

          {/* Status strip */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={FileText}
              label="Scripts ready"
              value={`${unused}`}
              hint={unused === 0 ? 'Queue is dry' : 'in the queue'}
              tone={unused === 0 ? 'warn' : 'ok'}
            />
            <StatCard
              icon={Clock}
              label="Status"
              value={enabled ? 'On' : 'Off'}
              hint={enabled ? `${slotsPerDay} slot${slotsPerDay === 1 ? '' : 's'}/day` : 'Tap to enable'}
              tone={enabled ? 'ok' : 'muted'}
            />
            <StatCard
              icon={Globe}
              label="Earliest slot"
              value={toHM(earliestSlot)}
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
                  Each slot below fires once per day in {tz}, picking the next unused script (or
                  your manual override if one is queued).
                </div>
              </div>
            </label>
          </div>

          {/* Daily auto-slots */}
          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                Daily auto-slots
              </div>
              <div className="text-[11px] text-zinc-500">{slots.length}/8</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {slots.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 border border-teal-500/40 px-3 py-1 text-sm text-teal-200 font-mono"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSlot(s)}
                    className="ml-1 -mr-1 p-0.5 rounded-full hover:bg-teal-500/30 text-teal-300"
                    aria-label={`Remove slot ${s}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="time"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
              />
              <button
                type="button"
                onClick={addSlot}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add slot
              </button>
            </div>
          </div>

          {/* Timezone */}
          <div className="mt-4">
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
          <div className="mt-5 flex items-center gap-3 flex-wrap">
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

          {unused < slotsPerDay * 3 && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {unused} script{unused === 1 ? '' : 's'} left in the queue for {slotsPerDay} slot
                {slotsPerDay === 1 ? '' : 's'}/day — that&apos;s ~{Math.floor(unused / Math.max(1, slotsPerDay))} day
                {Math.floor(unused / Math.max(1, slotsPerDay)) === 1 ? '' : 's'} of runway.
                Generate a fresh batch to keep the auto-pilot fed.
              </span>
            </div>
          )}
        </div>

        {/* ═══ Section 2 — Next 7 days grid ═══════════════════════ */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Calendar className="w-4 h-4 text-zinc-400" /> Next 7 days
          </h2>
          {next7.length === 0 ? (
            <EmptyHint>No plan yet — enable auto-pilot or add an override below.</EmptyHint>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
              {next7.map((day) => (
                <div
                  key={day.date}
                  className="rounded-xl border border-white/10 bg-zinc-950 p-2.5 flex flex-col"
                >
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    {day.weekday}
                  </div>
                  <div className="text-xs text-zinc-300 font-mono mb-2">{day.date.slice(5)}</div>
                  <div className="flex flex-col gap-1.5">
                    {day.slots.length === 0 ? (
                      <div className="text-[10px] text-zinc-600">no slots</div>
                    ) : (
                      day.slots.map((slot, i) => <SlotPill key={`${day.date}-${i}`} slot={slot} />)
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ Section 3 — Manual override form ═══════════════════ */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <CalendarPlus className="w-4 h-4 text-zinc-400" /> Schedule a specific script
          </h2>
          {availableScripts.length === 0 ? (
            <EmptyHint>
              No unused scripts available. Generate more from{' '}
              <Link href={`/avatars/${id}/scripts/new`} className="text-teal-300 underline">
                Generate scripts
              </Link>
              .
            </EmptyHint>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <Field label="Script">
                    <select
                      value={ovScriptId}
                      onChange={(e) => setOvScriptId(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                    >
                      {availableScripts.map((s) => (
                        <option key={s.id} value={s.id}>
                          [{s.script_type}] {s.hook ? s.hook.slice(0, 60) : s.preview.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Date">
                  <input
                    type="date"
                    value={ovDate}
                    onChange={(e) => setOvDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </Field>
                <Field label="Slot">
                  <select
                    value={ovTime}
                    onChange={(e) => setOvTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  >
                    {slots.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {!slots.includes(ovTime) && <option value={ovTime}>{ovTime} (custom)</option>}
                  </select>
                </Field>
              </div>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={submitOverride}
                  disabled={ovSubmitting || !ovScriptId}
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-sm font-semibold flex items-center gap-1.5 text-zinc-950"
                >
                  {ovSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CalendarPlus className="w-4 h-4" />
                  )}
                  Schedule it
                </button>
                {ovError && (
                  <span className="text-xs text-red-300 inline-flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {ovError}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Existing overrides list */}
          {next7.some((d) => d.slots.some((s) => s.kind === 'override')) && (
            <div className="mt-5">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
                Pending overrides
              </div>
              <ul className="space-y-1.5">
                {next7.flatMap((d) =>
                  d.slots
                    .filter((s) => s.kind === 'override' && s.override_id)
                    .map((s) => (
                      <li
                        key={`${d.date}-${s.time}-${s.override_id}`}
                        className="flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs"
                      >
                        <Calendar className="w-3.5 h-3.5 text-teal-300 flex-shrink-0" />
                        <span className="text-teal-200 font-mono">
                          {d.date} {s.time}
                        </span>
                        <span className="text-zinc-400 truncate flex-1">
                          {s.script_hook || '(script)'}
                        </span>
                        <button
                          type="button"
                          onClick={() => s.override_id && cancelOverride(s.override_id)}
                          className="px-2 py-0.5 rounded hover:bg-red-500/20 text-red-300 text-[11px]"
                        >
                          Cancel
                        </button>
                      </li>
                    )),
                )}
              </ul>
            </div>
          )}
        </div>

        {/* ═══ Section 4 — Library ════════════════════════════════ */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Video className="w-4 h-4 text-zinc-400" /> Recently made for this avatar
            <span className="text-[11px] text-zinc-500 font-normal ml-1">(last 30 days)</span>
          </h2>
          {library.length === 0 ? (
            <EmptyHint>
              No content yet. Once auto-pilot or a manual override fires you&apos;ll see videos
              show up here.
            </EmptyHint>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {library.map((item) => (
                <LibraryCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function SlotPill({ slot }: { slot: PlannedSlot }) {
  if (slot.kind === 'override') {
    return (
      <div className="rounded-md bg-teal-500/15 border border-teal-500/40 px-2 py-1">
        <div className="text-[10px] uppercase tracking-wide text-teal-300 flex items-center gap-1">
          <CalendarPlus className="w-2.5 h-2.5" /> override
        </div>
        <div className="text-[11px] text-white font-mono">{slot.time}</div>
        <div className="text-[10px] text-zinc-300 truncate" title={slot.script_hook || ''}>
          {slot.script_hook || '(script)'}
        </div>
      </div>
    );
  }
  if (slot.kind === 'auto') {
    return (
      <div className="rounded-md bg-zinc-900 border border-white/10 px-2 py-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">auto</div>
        <div className="text-[11px] text-white font-mono">{slot.time}</div>
        <div className="text-[10px] text-zinc-400 truncate" title={slot.script_hook || ''}>
          {slot.script_hook || ''}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md bg-zinc-900/50 border border-dashed border-zinc-700 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-amber-400/80">empty</div>
      <div className="text-[11px] text-zinc-500 font-mono">{slot.time}</div>
      <div className="text-[10px] text-zinc-600">no script</div>
    </div>
  );
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const video = item.final_video_url || item.rendered_video_url || null;
  const dt = new Date(item.created_at);
  const dateLabel = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const isPosted = item.status === 'posted' || !!item.posted_at;
  const statusLabel = isPosted ? 'Posted' : item.status || 'draft';

  return (
    <Link
      href={`/admin/post/${item.id}`}
      className="group rounded-lg border border-white/10 bg-zinc-950 overflow-hidden hover:border-teal-500/50 transition flex flex-col"
    >
      <div className="aspect-[9/16] bg-zinc-900 flex items-center justify-center text-zinc-700 group-hover:text-teal-400 relative">
        {video ? (
          // Native <video> with no controls used as a poster surface.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={video}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin opacity-50" />
        )}
        <div
          className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
            isPosted
              ? 'bg-emerald-500/90 text-emerald-950'
              : 'bg-zinc-800/90 text-zinc-200 border border-white/10'
          }`}
        >
          {statusLabel}
        </div>
        <div className="absolute top-1.5 right-1.5 p-1 rounded bg-zinc-900/70 text-zinc-200 opacity-0 group-hover:opacity-100 transition">
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[10px] text-zinc-500">{dateLabel}</div>
        <div className="text-[11px] text-zinc-200 truncate">
          {item.title || item.primary_hook || 'untitled'}
        </div>
      </div>
    </Link>
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

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-6 text-center text-xs text-zinc-500">
      {children}
    </div>
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

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Given a Date that represents wall-clock time interpreted in the BROWSER's
 * timezone, return the millisecond delta needed to shift it so the same
 * wall-clock is interpreted in `targetTz` instead.
 *
 * Used for the override form: the user picks "Aug 12 at 14:00" and means
 * "in the avatar's timezone", but `new Date("2026-08-12T14:00:00")` interprets
 * that as the browser's local zone. We correct by the offset difference.
 */
function browserToTzOffsetMs(d: Date, targetTz: string): number {
  // Format the same instant in both zones and parse the wall-clock back out.
  const local = formatYmdHms(d, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const target = formatYmdHms(d, targetTz);
  const localMs = Date.parse(local + 'Z');
  const targetMs = Date.parse(target + 'Z');
  return localMs - targetMs;
}

function formatYmdHms(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`;
}

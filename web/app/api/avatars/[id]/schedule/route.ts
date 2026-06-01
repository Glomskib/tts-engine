/**
 * /api/avatars/[id]/schedule
 *   GET   — return current schedule settings + slots + next-7-days plan + recent library
 *   PATCH — update { daily_post_enabled, daily_post_timezone, daily_post_target_times[] }
 *
 * Backwards compatible — if the new daily_post_target_times TEXT[] column is
 * NULL on an old row, we fall back to the legacy daily_post_target_time TIME
 * column. PATCH writes BOTH columns when a single slot is provided so the old
 * column stays meaningful for any code that hasn't migrated yet.
 *
 * All routes are owner-scoped (avatar must belong to the calling user).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMMSS = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function normalizeSlot(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (HHMMSS.test(t)) return t;
  if (HHMM.test(t)) return `${t}:00`;
  return null;
}

function toHM(t: string): string {
  return (t || '').slice(0, 5);
}

/** Resolve the canonical slot list for an avatar — new column first, legacy fallback. */
function resolveSlots(row: {
  daily_post_target_times: string[] | null;
  daily_post_target_time: string | null;
}): string[] {
  if (Array.isArray(row.daily_post_target_times) && row.daily_post_target_times.length > 0) {
    return row.daily_post_target_times
      .map((s) => normalizeSlot(s))
      .filter((s): s is string => !!s)
      .sort();
  }
  if (row.daily_post_target_time) {
    const n = normalizeSlot(row.daily_post_target_time);
    return n ? [n] : ['08:00:00'];
  }
  return ['08:00:00'];
}

async function ownedAvatar(userId: string, id: string) {
  const { data } = await supabaseAdmin
    .from('brand_profiles')
    .select(
      'id, user_id, avatar_display_name, name, daily_post_enabled, daily_post_target_time, daily_post_target_times, daily_post_timezone',
    )
    .eq('id', id)
    .eq('user_id', userId)
    .eq('is_avatar', true)
    .maybeSingle();
  return data;
}

interface ScriptRow {
  id: string;
  script_type: string;
  hook: string | null;
  body: string | null;
  created_at: string;
}

interface OverrideRow {
  id: string;
  scheduled_for: string;
  avatar_script_id: string | null;
  status: string;
}

/**
 * Build the next-7-days plan. For each day × each slot we decide:
 *   - "override" if there's a pending avatar_scheduled_posts row in that slot window
 *   - "auto"     if there are unused scripts we'd consume from the queue
 *   - "empty"    otherwise
 */
function buildNext7Days(
  slots: string[],
  unusedScripts: ScriptRow[],
  overrides: OverrideRow[],
  timezone: string,
) {
  // Iterate the next 7 calendar days in the avatar's timezone, slot by slot.
  // We use Intl.DateTimeFormat to extract a stable YYYY-MM-DD per day, then
  // anchor a Date in UTC by interpreting the local wall-clock time. For the
  // purposes of the planning UI we don't need second-level DST accuracy —
  // the cron is the source of truth at fire time.
  const fmtDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const fmtWeekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });

  const remaining = [...unusedScripts]; // mutated as we assign auto slots
  const out: Array<{
    date: string;
    weekday: string;
    slots: Array<{
      time: string;
      kind: 'override' | 'auto' | 'empty';
      script_id: string | null;
      script_hook: string | null;
      override_id?: string;
    }>;
  }> = [];

  const now = new Date();
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dateStr = fmtDate.format(day); // YYYY-MM-DD in avatar tz
    const weekday = fmtWeekday.format(day);

    const slotPlans = slots.map((slot) => {
      const hm = toHM(slot);
      // Match overrides by date string + hour (slot dedupe is per hour).
      const match = overrides.find((o) => {
        const local = fmtDate.format(new Date(o.scheduled_for));
        if (local !== dateStr) return false;
        const ohm = new Date(o.scheduled_for).toLocaleTimeString('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        return ohm.slice(0, 2) === hm.slice(0, 2);
      });

      if (match) {
        const script = unusedScripts.find((s) => s.id === match.avatar_script_id);
        return {
          time: hm,
          kind: 'override' as const,
          script_id: match.avatar_script_id,
          script_hook: script?.hook || (match.avatar_script_id ? '(script)' : null),
          override_id: match.id,
        };
      }

      // Otherwise auto-pick the next unused script if we have any left.
      const pick = remaining.shift();
      if (pick) {
        return {
          time: hm,
          kind: 'auto' as const,
          script_id: pick.id,
          script_hook: pick.hook || `${pick.script_type} script`,
        };
      }
      return {
        time: hm,
        kind: 'empty' as const,
        script_id: null,
        script_hook: null,
      };
    });

    out.push({ date: dateStr, weekday, slots: slotPlans });
  }

  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  const slots = resolveSlots({
    daily_post_target_times: (avatar.daily_post_target_times as string[] | null) || null,
    daily_post_target_time: (avatar.daily_post_target_time as string | null) || null,
  });
  const timezone = (avatar.daily_post_timezone as string) || 'America/New_York';

  // Parallel fetches:
  //   - unused scripts (for both counter and next-7-days planning)
  //   - pending overrides for the next 9 days (room for tz edge)
  //   - last-30-days library for this avatar
  const horizonStart = new Date();
  horizonStart.setUTCHours(0, 0, 0, 0);
  const horizonEnd = new Date(horizonStart.getTime() + 9 * 24 * 60 * 60 * 1000);
  const libraryStart = new Date(horizonStart.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [scriptsRes, overridesRes, libraryRes, unusedCountRes] = await Promise.all([
    supabaseAdmin
      .from('avatar_scripts')
      .select('id, script_type, hook, body, created_at')
      .eq('brand_profile_id', id)
      .is('used_at', null)
      .order('created_at', { ascending: true })
      .limit(60),
    supabaseAdmin
      .from('avatar_scheduled_posts')
      .select('id, scheduled_for, avatar_script_id, status')
      .eq('brand_profile_id', id)
      .eq('status', 'pending')
      .gte('scheduled_for', horizonStart.toISOString())
      .lte('scheduled_for', horizonEnd.toISOString())
      .order('scheduled_for', { ascending: true }),
    supabaseAdmin
      .from('content_items')
      .select(
        'id, title, status, final_video_url, rendered_video_url, post_url, posted_at, created_at, primary_hook',
      )
      .eq('brand_profile_id', id)
      .gte('created_at', libraryStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(12),
    supabaseAdmin
      .from('avatar_scripts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_profile_id', id)
      .is('used_at', null),
  ]);

  const unusedScripts = (scriptsRes.data || []) as ScriptRow[];
  const overrides = (overridesRes.data || []) as OverrideRow[];
  const library = libraryRes.data || [];

  const next7Days = buildNext7Days(slots, unusedScripts, overrides, timezone);

  // Drop-list for the "schedule a specific script" form — every unused script
  // minus the ones already assigned to a pending override.
  const overridedIds = new Set(overrides.map((o) => o.avatar_script_id).filter(Boolean) as string[]);
  const availableScripts = unusedScripts
    .filter((s) => !overridedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      script_type: s.script_type,
      hook: s.hook,
      preview: (s.body || '').slice(0, 120),
    }));

  return NextResponse.json({
    ok: true,
    settings: {
      daily_post_enabled: !!avatar.daily_post_enabled,
      daily_post_target_time: avatar.daily_post_target_time || slots[0] || '08:00:00',
      daily_post_target_times: slots,
      daily_post_timezone: timezone,
    },
    pipeline: {
      unused_scripts: unusedCountRes.count ?? unusedScripts.length,
      scripts_available_for_override: availableScripts.length,
    },
    slots,
    next_7_days: next7Days,
    available_scripts: availableScripts,
    overrides: overrides.map((o) => ({
      id: o.id,
      scheduled_for: o.scheduled_for,
      avatar_script_id: o.avatar_script_id,
      status: o.status,
    })),
    library,
    correlation_id: correlationId,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: {
    daily_post_enabled?: unknown;
    daily_post_target_time?: unknown;
    daily_post_target_times?: unknown;
    daily_post_timezone?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('daily_post_enabled' in body) {
    updates.daily_post_enabled = !!body.daily_post_enabled;
  }

  // Multi-slot path — preferred.
  if ('daily_post_target_times' in body) {
    if (!Array.isArray(body.daily_post_target_times)) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'daily_post_target_times must be an array of HH:MM strings',
        400,
        correlationId,
      );
    }
    if (body.daily_post_target_times.length === 0) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'At least one slot required',
        400,
        correlationId,
      );
    }
    if (body.daily_post_target_times.length > 8) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'Max 8 slots per day',
        400,
        correlationId,
      );
    }
    const normalized: string[] = [];
    for (const raw of body.daily_post_target_times) {
      const n = normalizeSlot(raw);
      if (!n) {
        return createApiErrorResponse(
          'VALIDATION_ERROR',
          `Invalid slot "${String(raw)}" — must be HH:MM or HH:MM:SS`,
          400,
          correlationId,
        );
      }
      if (!normalized.includes(n)) normalized.push(n);
    }
    normalized.sort();
    updates.daily_post_target_times = normalized;
    // Keep the legacy column in sync with the earliest slot so any code
    // that still reads it doesn't break.
    updates.daily_post_target_time = normalized[0];
  } else if ('daily_post_target_time' in body && typeof body.daily_post_target_time === 'string') {
    // Single-time legacy path — still accepted.
    const n = normalizeSlot(body.daily_post_target_time);
    if (!n) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'daily_post_target_time must be HH:MM or HH:MM:SS',
        400,
        correlationId,
      );
    }
    updates.daily_post_target_time = n;
    updates.daily_post_target_times = [n];
  }

  if ('daily_post_timezone' in body && typeof body.daily_post_timezone === 'string') {
    const tz = body.daily_post_timezone.trim().slice(0, 64);
    if (!tz) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'daily_post_timezone required',
        400,
        correlationId,
      );
    }
    // Cheap sanity check — Intl will throw on a bogus tz id.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    } catch {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        `Unknown timezone "${tz}"`,
        400,
        correlationId,
      );
    }
    updates.daily_post_timezone = tz;
  }

  const { error } = await supabaseAdmin
    .from('brand_profiles')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.user.id);

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}

/**
 * Cron: avatar daily orchestrator (v2 — multi-slot + manual overrides).
 *
 * For every avatar (brand_profiles where is_avatar=true) with
 * daily_post_enabled=true, this cron walks each configured slot in
 * daily_post_target_times and ensures one content_item gets produced
 * per (avatar, calendar date, slot).
 *
 * For each (avatar × slot × today) it:
 *
 *   1. Skips if a content_item is already tagged with avatar_slot_key for
 *      that slot (re-runs are safe).
 *   2. Checks avatar_scheduled_posts for a PENDING override whose
 *      scheduled_for falls inside the slot's ±30-minute window.
 *        - If yes: use override.avatar_script_id, mark override 'fired'.
 *        - If no:  fall back to the next unused avatar_script.
 *   3. Fires POST /api/avatars/{id}/render/publish-ready with { script_id }.
 *   4. Marks the script used + stamps avatar_slot_key on the content_item.
 *
 * Backwards compatible — if daily_post_target_times is NULL we fall back to
 * the legacy single daily_post_target_time column.
 *
 * Auth: x-vercel-cron header OR Authorization: Bearer CRON_SECRET.
 *
 * Schedule (registered in vercel.json):
 *   { "path": "/api/cron/avatar-daily-tick", "schedule": "0 13 * * *" }
 *
 * NOTE on slot timing: this cron runs once a day at 13:00 UTC and processes
 * EVERY slot that should have fired in the last 24 hours plus any imminent
 * slots in the next hour. For minute-precision slot firing you'd run the
 * cron every 15 min instead; the dedupe on avatar_slot_key keeps that safe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SLOT_WINDOW_MINUTES = 30; // override match window around the slot time

function authorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

interface Avatar {
  id: string;
  user_id: string;
  name: string | null;
  avatar_display_name: string | null;
  daily_post_target_times: string[] | null;
  daily_post_target_time: string | null;
  daily_post_timezone: string | null;
}

interface PublishReadyResponse {
  ok?: boolean;
  content_item_id?: string;
  contentItemId?: string;
  id?: string;
  error?: string;
}

interface OverrideRow {
  id: string;
  scheduled_for: string;
  avatar_script_id: string | null;
}

/** Resolve slot list with legacy fallback. */
function resolveSlots(avatar: Avatar): string[] {
  const arr = avatar.daily_post_target_times;
  if (Array.isArray(arr) && arr.length > 0) {
    return Array.from(
      new Set(
        arr
          .filter((s): s is string => typeof s === 'string')
          .map((s) => (s.length === 5 ? `${s}:00` : s))
          .filter((s) => /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s)),
      ),
    ).sort();
  }
  if (avatar.daily_post_target_time) {
    const t = avatar.daily_post_target_time;
    return [t.length === 5 ? `${t}:00` : t];
  }
  return ['08:00:00'];
}

/**
 * For an avatar's timezone, return the UTC Date that corresponds to today's
 * wall-clock HH:MM:SS in that tz. Used to align cron runs with the operator's
 * intent (e.g. an "08:00" slot in America/New_York means "08:00 ET").
 *
 * Approach: pick the date-string for "now" in the target tz, then iterate
 * candidate UTC offsets until we find the one whose wall-clock in that tz
 * matches what we asked for. DST-aware. The ±30-min slot match window in
 * the cron means small drift is harmless.
 */
function slotInstantForToday(timezone: string, hhmmss: string): Date {
  const now = new Date();
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = hhmmss.split(':').map(Number);

  // First guess: treat the wall clock as if it were UTC.
  let utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  // Refine twice — one pass corrects for the standard offset, second pass
  // handles DST transitions where the offset itself changes by an hour.
  for (let i = 0; i < 2; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(utcGuess);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    const seenUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) === 24 ? 0 : Number(map.hour),
      Number(map.minute),
      Number(map.second),
    );
    const wantUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
    utcGuess = new Date(utcGuess.getTime() + (wantUtc - seenUtc));
  }
  return utcGuess;
}

function slotKey(date: Date, timezone: string, hhmmss: string): string {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `${dateStr}|${hhmmss.slice(0, 5)}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const baseUrl = getBaseUrl();
  const cronSecret = process.env.CRON_SECRET || '';
  const internalKey = process.env.INTERNAL_API_KEY || cronSecret;

  const result = {
    ok: true,
    avatars_processed: 0,
    slots_processed: 0,
    content_items_created: 0,
    overrides_fired: 0,
    skipped_already_done: 0,
    skipped_not_due_yet: 0,
    skipped_no_scripts: 0,
    errors: [] as Array<{ avatar_id: string; slot?: string; message: string }>,
  };

  // 1. Pull every enabled avatar with its slot config.
  const { data: avatars, error: avErr } = await supabaseAdmin
    .from('brand_profiles')
    .select(
      'id, user_id, name, avatar_display_name, daily_post_target_times, daily_post_target_time, daily_post_timezone',
    )
    .eq('is_avatar', true)
    .eq('daily_post_enabled', true);

  if (avErr) {
    console.error('[avatar-daily-tick] failed to load avatars:', avErr.message);
    return NextResponse.json({ ok: false, error: avErr.message }, { status: 500 });
  }

  const list = (avatars || []) as Avatar[];
  result.avatars_processed = list.length;

  const runStartedAt = new Date();
  const lookbackMs = 24 * 60 * 60 * 1000; // process anything overdue in last 24h
  const lookaheadMs = 60 * 60 * 1000; // and the next hour

  for (const avatar of list) {
    const timezone = avatar.daily_post_timezone || 'America/New_York';
    const slots = resolveSlots(avatar);

    for (const slot of slots) {
      result.slots_processed += 1;
      try {
        const slotInstant = slotInstantForToday(timezone, slot);
        const ageMs = runStartedAt.getTime() - slotInstant.getTime();

        // Outside the operating window — skip silently.
        if (ageMs > lookbackMs || ageMs < -lookaheadMs) {
          result.skipped_not_due_yet += 1;
          continue;
        }

        const key = slotKey(slotInstant, timezone, slot);

        // 2. Idempotency check — already produced for this slot?
        const { data: existing, error: exErr } = await supabaseAdmin
          .from('content_items')
          .select('id')
          .eq('brand_profile_id', avatar.id)
          .eq('avatar_slot_key', key)
          .limit(1);
        if (exErr) throw new Error(`slot-key lookup: ${exErr.message}`);
        if (existing && existing.length > 0) {
          result.skipped_already_done += 1;
          continue;
        }

        // 3. Look for a pending override matching this slot (±30 min).
        const winStart = new Date(slotInstant.getTime() - SLOT_WINDOW_MINUTES * 60 * 1000);
        const winEnd = new Date(slotInstant.getTime() + SLOT_WINDOW_MINUTES * 60 * 1000);
        const { data: overrideRows, error: ovErr } = await supabaseAdmin
          .from('avatar_scheduled_posts')
          .select('id, scheduled_for, avatar_script_id')
          .eq('brand_profile_id', avatar.id)
          .eq('status', 'pending')
          .gte('scheduled_for', winStart.toISOString())
          .lte('scheduled_for', winEnd.toISOString())
          .order('scheduled_for', { ascending: true })
          .limit(1);
        if (ovErr) throw new Error(`overrides lookup: ${ovErr.message}`);
        const override = (overrideRows || [])[0] as OverrideRow | undefined;

        let scriptId: string | null = null;
        let overrideId: string | null = null;

        if (override && override.avatar_script_id) {
          // Claim the override row atomically by flipping pending -> fired.
          // If two cron runs race, only one update will match.
          const { data: claimed, error: claimErr } = await supabaseAdmin
            .from('avatar_scheduled_posts')
            .update({ status: 'fired', fired_at: new Date().toISOString() })
            .eq('id', override.id)
            .eq('status', 'pending')
            .select('id, avatar_script_id')
            .maybeSingle();
          if (claimErr) throw new Error(`override claim: ${claimErr.message}`);
          if (claimed) {
            scriptId = claimed.avatar_script_id;
            overrideId = claimed.id;
          }
        }

        // 4. Fallback — next unused script.
        if (!scriptId) {
          const { data: scripts, error: sErr } = await supabaseAdmin
            .from('avatar_scripts')
            .select('id')
            .eq('brand_profile_id', avatar.id)
            .is('used_at', null)
            .order('created_at', { ascending: true })
            .limit(1);
          if (sErr) throw new Error(`avatar_scripts lookup: ${sErr.message}`);
          const next = (scripts || [])[0];
          if (!next) {
            console.warn('[avatar-daily-tick] no scripts available', {
              avatar_id: avatar.id,
              slot,
              name: avatar.avatar_display_name || avatar.name,
            });
            result.skipped_no_scripts += 1;
            continue;
          }
          scriptId = next.id;
        }

        // 5. Fire publish-ready (Bridge 2 owns the render lifecycle).
        const url = `${baseUrl}/api/avatars/${avatar.id}/render/publish-ready`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': internalKey,
            ...(cronSecret ? { authorization: `Bearer ${cronSecret}` } : {}),
          },
          body: JSON.stringify({ script_id: scriptId }),
          signal: AbortSignal.timeout(60_000),
        });

        let contentItemId: string | undefined;
        let parsed: PublishReadyResponse | null = null;
        try {
          parsed = (await resp.json()) as PublishReadyResponse;
          contentItemId = parsed.content_item_id || parsed.contentItemId || parsed.id;
        } catch {
          /* non-JSON / empty body is okay — fire-and-forget */
        }

        if (!resp.ok) {
          // If we claimed an override but the render failed, mark it failed so
          // the UI surfaces what happened.
          if (overrideId) {
            await supabaseAdmin
              .from('avatar_scheduled_posts')
              .update({
                status: 'failed',
                error: `publish-ready ${resp.status}: ${parsed?.error || resp.statusText}`,
              })
              .eq('id', overrideId);
          }
          throw new Error(`publish-ready ${resp.status}: ${parsed?.error || resp.statusText}`);
        }

        // 6. Stamp the content_item with the slot key for dedupe.
        if (contentItemId) {
          await supabaseAdmin
            .from('content_items')
            .update({ avatar_slot_key: key })
            .eq('id', contentItemId);
          // And link the override to the spawned content_item if we used one.
          if (overrideId) {
            await supabaseAdmin
              .from('avatar_scheduled_posts')
              .update({ content_item_id: contentItemId })
              .eq('id', overrideId);
          }
        }

        // 7. Mark script used. Best-effort.
        const { error: updErr } = await supabaseAdmin
          .from('avatar_scripts')
          .update({
            used_at: new Date().toISOString(),
            used_for_content_item_id: contentItemId || null,
          })
          .eq('id', scriptId);
        if (updErr) {
          console.error('[avatar-daily-tick] failed to mark script used', {
            script_id: scriptId,
            error: updErr.message,
          });
        }

        result.content_items_created += 1;
        if (overrideId) result.overrides_fired += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[avatar-daily-tick] slot error', {
          avatar_id: avatar.id,
          slot,
          message,
        });
        result.errors.push({ avatar_id: avatar.id, slot, message });
      }
    }
  }

  return NextResponse.json(result);
}

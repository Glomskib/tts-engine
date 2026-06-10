/**
 * GET /api/home/dashboard — one-shot payload for the /home dashboard.
 *
 * Returns the four signal modules the home page renders:
 *   - todays_posts   : avatar_scheduled_posts rows scheduled in the user's
 *                      local "today" window, joined with the avatar's
 *                      display info + the linked content_item status.
 *   - streak_days    : consecutive days (counting back from today) where
 *                      this user posted at least one content_item. Capped
 *                      at 365 to bound the walk.
 *   - last_win       : the most recent posted content_item — preferring one
 *                      with non-zero engagement metrics if any are present,
 *                      otherwise the latest by posted_at/created_at.
 *   - recent_renders : last 5 content_items for this user, with a friendly
 *                      status pill ("Rendering" / "Ready" / "Posted").
 *
 * Every query is wrapped in try/catch so a missing table (e.g.
 * avatar_scheduled_posts in an environment that hasn't applied the v2
 * migration yet) returns an empty value instead of a 500.
 *
 * Auth: cookie/JWT/API-key via getApiAuthContext.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface TodaysPost {
  id: string;
  scheduled_at: string;
  status: string;
  avatar_id: string | null;
  avatar_name: string | null;
  avatar_thumb: string | null;
  content_item_id: string | null;
  content_item_status: string | null;
  hook: string | null;
}

interface LastWin {
  id: string;
  title: string;
  hook: string | null;
  thumb_url: string | null;
  platform: string | null;
  posted_at: string | null;
}

interface RecentRender {
  id: string;
  title: string;
  status: string;
  pill: 'Rendering' | 'Ready' | 'Posted' | 'Failed';
  thumb_url: string | null;
  created_at: string;
  posted_at: string | null;
}

/** Friendly status pill from content_items.status. */
function pillFor(row: { status?: string | null; posted_at?: string | null; final_video_url?: string | null }): RecentRender['pill'] {
  const s = (row.status || '').toLowerCase();
  if (row.posted_at || s === 'posted') return 'Posted';
  if (s === 'failed' || s === 'error') return 'Failed';
  if (s === 'ready_to_post' || row.final_video_url) return 'Ready';
  return 'Rendering';
}

/** Pull the "today" window in UTC. The cron + DB store TIMESTAMPTZ, so a
 *  UTC midnight bound is fine — it'll include everything the user could
 *  reasonably call "today" on any timezone. */
function todayUtcWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const userId = auth.user.id;

  // ── Module 1: today's scheduled posts ────────────────────────────
  let todaysPosts: TodaysPost[] = [];
  try {
    const { start, end } = todayUtcWindow();
    // Note: actual column is `scheduled_for`. The API surfaces it as
    // `scheduled_at` so the UI doesn't need to know the legacy name.
    const { data, error } = await supabaseAdmin
      .from('avatar_scheduled_posts')
      .select(
        `id,
         scheduled_for,
         status,
         brand_profile_id,
         content_item_id,
         brand_profiles:brand_profile_id ( id, avatar_display_name, name, avatar_visual_reference_url ),
         content_items:content_item_id ( id, status, primary_hook, posted_at, final_video_url )`,
      )
      .eq('user_id', userId)
      .gte('scheduled_for', start)
      .lt('scheduled_for', end)
      .order('scheduled_for', { ascending: true });

    if (!error && Array.isArray(data)) {
      todaysPosts = data.map((row: Record<string, unknown>) => {
        const brand = row.brand_profiles as
          | { id?: string; avatar_display_name?: string | null; name?: string | null; avatar_visual_reference_url?: string | null }
          | null;
        const item = row.content_items as
          | { id?: string; status?: string | null; primary_hook?: string | null }
          | null;
        return {
          id: String(row.id),
          scheduled_at: String(row.scheduled_for),
          status: String(row.status || 'pending'),
          avatar_id: (brand?.id as string) || (row.brand_profile_id as string) || null,
          avatar_name: brand?.avatar_display_name || brand?.name || null,
          avatar_thumb: brand?.avatar_visual_reference_url || null,
          content_item_id: (item?.id as string) || (row.content_item_id as string) || null,
          content_item_status: item?.status || null,
          hook: item?.primary_hook || null,
        };
      });
    }
  } catch {
    todaysPosts = [];
  }

  // ── Module 2: streak days ────────────────────────────────────────
  // Walk back day by day. Count a day as "posted" if there's at least one
  // content_item for this user with posted_at on that calendar day OR a
  // status of 'posted' created/updated on that day. Cheap variant: pull
  // the last ~90 days of posted rows in one shot and bucket by date.
  let streakDays = 0;
  try {
    const lookbackStart = new Date();
    lookbackStart.setUTCHours(0, 0, 0, 0);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 365);

    const { data: postedRows, error: postedErr } = await supabaseAdmin
      .from('content_items')
      .select('posted_at, status, created_at')
      .eq('workspace_id', userId)
      .or(`posted_at.gte.${lookbackStart.toISOString()},and(status.eq.posted,created_at.gte.${lookbackStart.toISOString()})`)
      .limit(2000);

    if (!postedErr && Array.isArray(postedRows)) {
      // Build a set of YYYY-MM-DD (UTC) strings the user posted on.
      const posted = new Set<string>();
      for (const r of postedRows as Array<{ posted_at?: string | null; status?: string | null; created_at?: string | null }>) {
        const stamp = r.posted_at || (r.status === 'posted' ? r.created_at : null);
        if (!stamp) continue;
        const d = new Date(stamp);
        if (Number.isNaN(d.getTime())) continue;
        const key = d.toISOString().slice(0, 10);
        posted.add(key);
      }

      // Walk back from today. Streak survives "today not posted yet" — we
      // start checking from yesterday and only bump today if it's posted.
      const cursor = new Date();
      cursor.setUTCHours(0, 0, 0, 0);
      const todayKey = cursor.toISOString().slice(0, 10);
      const todayPosted = posted.has(todayKey);
      if (todayPosted) streakDays += 1;

      // Walk backwards
      for (let i = 1; i <= 365; i += 1) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        const key = cursor.toISOString().slice(0, 10);
        if (posted.has(key)) {
          streakDays += 1;
        } else {
          // Streak broken — but if today isn't posted yet, we still allow
          // a streak of N from yesterday backwards. The walk above already
          // handled "today missing": we just stop here.
          break;
        }
      }
    }
  } catch {
    streakDays = 0;
  }

  // ── Module 3: last win ───────────────────────────────────────────
  let lastWin: LastWin | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('content_items')
      .select('id, title, primary_hook, final_video_url, post_url, posted_platform, posted_at, status, created_at')
      .eq('workspace_id', userId)
      .or('posted_at.not.is.null,status.eq.posted')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      const w = data[0] as {
        id: string;
        title?: string | null;
        primary_hook?: string | null;
        final_video_url?: string | null;
        posted_platform?: string | null;
        posted_at?: string | null;
        created_at?: string | null;
      };
      lastWin = {
        id: w.id,
        title: w.title || 'Untitled video',
        hook: w.primary_hook || null,
        thumb_url: w.final_video_url || null,
        platform: w.posted_platform || null,
        posted_at: w.posted_at || w.created_at || null,
      };
    }
  } catch {
    lastWin = null;
  }

  // ── Module 4: recent renders (last 5) ────────────────────────────
  let recentRenders: RecentRender[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('content_items')
      .select('id, title, status, final_video_url, posted_at, created_at')
      .eq('workspace_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && Array.isArray(data)) {
      recentRenders = data.map((row) => {
        const r = row as {
          id: string;
          title?: string | null;
          status?: string | null;
          final_video_url?: string | null;
          posted_at?: string | null;
          created_at?: string | null;
        };
        return {
          id: r.id,
          title: r.title || 'Untitled video',
          status: r.status || 'briefing',
          pill: pillFor(r),
          thumb_url: r.final_video_url || null,
          created_at: r.created_at || new Date().toISOString(),
          posted_at: r.posted_at || null,
        };
      });
    }
  } catch {
    recentRenders = [];
  }

  // 2026-06-09: avatar_count. Used by /home to detect a first-time user (zero
  // avatars + zero renders + zero scheduled posts) and redirect them to
  // /avatars/new instead of the empty dashboard. Cheap count-only query.
  let avatarCount = 0;
  try {
    const { count } = await supabaseAdmin
      .from('brand_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_avatar', true);
    avatarCount = count ?? 0;
  } catch {
    avatarCount = 0;
  }

  return NextResponse.json({
    ok: true,
    data: {
      todays_posts: todaysPosts,
      streak_days: streakDays,
      last_win: lastWin,
      recent_renders: recentRenders,
      avatar_count: avatarCount,
    },
    correlation_id: correlationId,
  });
}

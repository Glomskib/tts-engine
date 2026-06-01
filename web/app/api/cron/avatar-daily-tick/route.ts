/**
 * Cron: avatar daily orchestrator.
 *
 * For every avatar (brand_profiles where is_avatar=true) that has
 * daily_post_enabled=true, this cron ensures one fresh content_item gets
 * produced per calendar day. It:
 *
 *   1. Skips avatars that already have a content_item created today.
 *   2. Pulls the next unused script from avatar_scripts (used_at IS NULL).
 *   3. Fires POST /api/avatars/{id}/render/publish-ready with { script_id }.
 *      (Bridge 2 endpoint — it handles its own polling.)
 *   4. Marks the script used so we don't double-fire tomorrow.
 *
 * Auth: x-vercel-cron header OR Authorization: Bearer CRON_SECRET.
 *
 * Schedule (registered in vercel.json):
 *   { "path": "/api/cron/avatar-daily-tick", "schedule": "0 13 * * *" }
 *   13:00 UTC = ~8am US-Eastern (handles DST drift coarsely).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
}

interface Script {
  id: string;
}

interface PublishReadyResponse {
  ok?: boolean;
  content_item_id?: string;
  contentItemId?: string;
  id?: string;
  error?: string;
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
    content_items_created: 0,
    skipped_already_today: 0,
    skipped_no_scripts: 0,
    errors: [] as Array<{ avatar_id: string; message: string }>,
  };

  // 1. Pull every enabled avatar.
  const { data: avatars, error: avErr } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id, name, avatar_display_name')
    .eq('is_avatar', true)
    .eq('daily_post_enabled', true);

  if (avErr) {
    console.error('[avatar-daily-tick] failed to load avatars:', avErr.message);
    return NextResponse.json({ ok: false, error: avErr.message }, { status: 500 });
  }

  const list = (avatars || []) as Avatar[];
  result.avatars_processed = list.length;

  for (const avatar of list) {
    try {
      // 2. Already produced today?  Cheap dedupe so re-runs are idempotent.
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const { data: todays, error: ciErr } = await supabaseAdmin
        .from('content_items')
        .select('id')
        .eq('brand_profile_id', avatar.id)
        .gte('created_at', startOfDay.toISOString())
        .limit(1);
      if (ciErr) throw new Error(`content_items lookup: ${ciErr.message}`);
      if (todays && todays.length > 0) {
        result.skipped_already_today += 1;
        continue;
      }

      // 3. Next unused script.
      const { data: scripts, error: sErr } = await supabaseAdmin
        .from('avatar_scripts')
        .select('id')
        .eq('brand_profile_id', avatar.id)
        .is('used_at', null)
        .order('created_at', { ascending: true })
        .limit(1);
      if (sErr) throw new Error(`avatar_scripts lookup: ${sErr.message}`);
      const next = (scripts || [])[0] as Script | undefined;
      if (!next) {
        console.warn('[avatar-daily-tick] no scripts available', {
          avatar_id: avatar.id,
          name: avatar.avatar_display_name || avatar.name,
        });
        result.skipped_no_scripts += 1;
        continue;
      }

      // 4. Fire publish-ready (Bridge 2 owns the polling/render lifecycle).
      const url = `${baseUrl}/api/avatars/${avatar.id}/render/publish-ready`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': internalKey,
          ...(cronSecret ? { authorization: `Bearer ${cronSecret}` } : {}),
        },
        body: JSON.stringify({ script_id: next.id }),
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
        throw new Error(
          `publish-ready ${resp.status}: ${parsed?.error || resp.statusText}`,
        );
      }

      // 5. Mark script used. content_item_id is best-effort; column is nullable.
      const { error: updErr } = await supabaseAdmin
        .from('avatar_scripts')
        .update({
          used_at: new Date().toISOString(),
          used_for_content_item_id: contentItemId || null,
        })
        .eq('id', next.id);
      if (updErr) {
        // Don't fail the avatar — render is already kicked off.
        console.error('[avatar-daily-tick] failed to mark script used', {
          script_id: next.id,
          error: updErr.message,
        });
      }

      result.content_items_created += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[avatar-daily-tick] avatar error', {
        avatar_id: avatar.id,
        message,
      });
      result.errors.push({ avatar_id: avatar.id, message });
    }
  }

  return NextResponse.json(result);
}

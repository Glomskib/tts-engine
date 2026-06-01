/**
 * /api/avatars/[id]/schedule
 *   GET   — return current schedule settings + pipeline counters
 *   PATCH — update { daily_post_enabled, daily_post_target_time, daily_post_timezone }
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

async function ownedAvatar(userId: string, id: string) {
  const { data } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, user_id, daily_post_enabled, daily_post_target_time, daily_post_timezone')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('is_avatar', true)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  // Pipeline counters — unused scripts and last 7 days of auto content.
  const [{ count: unusedScripts }, { data: recent }] = await Promise.all([
    supabaseAdmin
      .from('avatar_scripts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_profile_id', id)
      .is('used_at', null),
    supabaseAdmin
      .from('content_items')
      .select('id, title, final_video_url, rendered_video_url, status, created_at, posted_at, post_url')
      .eq('brand_profile_id', id)
      .order('created_at', { ascending: false })
      .limit(7),
  ]);

  return NextResponse.json({
    ok: true,
    settings: {
      daily_post_enabled: !!avatar.daily_post_enabled,
      daily_post_target_time: avatar.daily_post_target_time || '08:00:00',
      daily_post_timezone: avatar.daily_post_timezone || 'America/New_York',
    },
    pipeline: {
      unused_scripts: unusedScripts ?? 0,
    },
    recent: recent || [],
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

  if ('daily_post_target_time' in body && typeof body.daily_post_target_time === 'string') {
    // Accept "HH:MM" or "HH:MM:SS"; reject anything else.
    const t = body.daily_post_target_time.trim();
    const ok = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t);
    if (!ok) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'daily_post_target_time must be HH:MM or HH:MM:SS',
        400,
        correlationId,
      );
    }
    updates.daily_post_target_time = t.length === 5 ? `${t}:00` : t;
  }

  if ('daily_post_timezone' in body && typeof body.daily_post_timezone === 'string') {
    const tz = body.daily_post_timezone.trim().slice(0, 64);
    if (!tz) {
      return createApiErrorResponse('VALIDATION_ERROR', 'daily_post_timezone required', 400, correlationId);
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

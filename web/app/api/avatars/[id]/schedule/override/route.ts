/**
 * /api/avatars/[id]/schedule/override
 *   GET    — list pending manual overrides for this avatar
 *   POST   — { script_id, scheduled_for } create a pending override row
 *   DELETE — { override_id } cancel a pending override
 *
 * Manual overrides take priority over the next-unused-script auto-pick when
 * the avatar-daily-tick cron evaluates a slot. They live in
 * avatar_scheduled_posts and are owner-scoped.
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
    .select('id, user_id, daily_post_timezone')
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

  const { data, error } = await supabaseAdmin
    .from('avatar_scheduled_posts')
    .select(
      'id, scheduled_for, avatar_script_id, content_item_id, status, fired_at, error, created_at',
    )
    .eq('brand_profile_id', id)
    .order('scheduled_for', { ascending: true });

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, overrides: data || [], correlation_id: correlationId });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: { script_id?: unknown; scheduled_for?: unknown };
  try {
    body = await req.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const scriptId = typeof body.script_id === 'string' ? body.script_id.trim() : '';
  const scheduledRaw = typeof body.scheduled_for === 'string' ? body.scheduled_for.trim() : '';
  if (!scriptId) return createApiErrorResponse('VALIDATION_ERROR', 'script_id required', 400, correlationId);
  if (!scheduledRaw) return createApiErrorResponse('VALIDATION_ERROR', 'scheduled_for required', 400, correlationId);

  const when = new Date(scheduledRaw);
  if (Number.isNaN(when.getTime())) {
    return createApiErrorResponse('VALIDATION_ERROR', 'scheduled_for must be a valid timestamp', 400, correlationId);
  }
  // Reject anything more than a minute in the past — the cron only looks
  // forward so a stale time would just sit there.
  if (when.getTime() < Date.now() - 60_000) {
    return createApiErrorResponse('VALIDATION_ERROR', 'scheduled_for must be in the future', 400, correlationId);
  }
  // And nothing absurdly far out — keeps planning views bounded.
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  if (when.getTime() > Date.now() + oneYearMs) {
    return createApiErrorResponse('VALIDATION_ERROR', 'scheduled_for is too far in the future', 400, correlationId);
  }

  // Validate the script belongs to this avatar and is unused.
  const { data: script, error: scriptErr } = await supabaseAdmin
    .from('avatar_scripts')
    .select('id, used_at, brand_profile_id')
    .eq('id', scriptId)
    .eq('brand_profile_id', id)
    .maybeSingle();
  if (scriptErr) return createApiErrorResponse('DB_ERROR', scriptErr.message, 500, correlationId);
  if (!script) return createApiErrorResponse('NOT_FOUND', 'script not found for this avatar', 404, correlationId);
  if (script.used_at) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'script has already been used',
      400,
      correlationId,
    );
  }

  // Reject if there's already a pending override at this exact slot — the DB
  // unique index would also catch this, but we surface a friendlier error.
  const { data: existing } = await supabaseAdmin
    .from('avatar_scheduled_posts')
    .select('id')
    .eq('brand_profile_id', id)
    .eq('scheduled_for', when.toISOString())
    .in('status', ['pending', 'fired'])
    .maybeSingle();
  if (existing) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'A post is already scheduled at that exact time',
      409,
      correlationId,
    );
  }

  const { data, error } = await supabaseAdmin
    .from('avatar_scheduled_posts')
    .insert({
      brand_profile_id: id,
      user_id: auth.user.id,
      scheduled_for: when.toISOString(),
      avatar_script_id: scriptId,
      status: 'pending',
    })
    .select('id, scheduled_for, avatar_script_id, status')
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, override: data, correlation_id: correlationId });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const avatar = await ownedAvatar(auth.user.id, id);
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  // Accept override_id from either JSON body or query string for flexibility.
  let overrideId = new URL(req.url).searchParams.get('override_id') || '';
  if (!overrideId) {
    try {
      const body = (await req.json()) as { override_id?: unknown };
      if (typeof body.override_id === 'string') overrideId = body.override_id.trim();
    } catch {
      /* body is optional when query param is provided */
    }
  }
  if (!overrideId) {
    return createApiErrorResponse('VALIDATION_ERROR', 'override_id required', 400, correlationId);
  }

  // Soft-cancel rather than hard-delete so we have an audit trail.
  const { data, error } = await supabaseAdmin
    .from('avatar_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', overrideId)
    .eq('brand_profile_id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  if (!data) return createApiErrorResponse('NOT_FOUND', 'override not found or already fired', 404, correlationId);

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}

import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const DEFAULT_PREFS = {
  va_submission: true,
  winner_detected: true,
  brand_quota: true,
  pipeline_idle: true,
  drive_new_video: true,
  competitor_viral: true,
  system: true,
  digest_frequency: 'realtime', // realtime | hourly | daily
  sound_enabled: false,
};

/**
 * GET /api/notifications/preferences
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('notification_preferences')
    .eq('user_id', authContext.user.id)
    .single();

  return NextResponse.json({
    ok: true,
    data: data?.notification_preferences || DEFAULT_PREFS,
    correlation_id: correlationId,
  });
}

/**
 * PUT /api/notifications/preferences
 */
export async function PUT(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const prefs = { ...DEFAULT_PREFS, ...(body as Record<string, unknown>) };

  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({
      user_id: authContext.user.id,
      notification_preferences: prefs,
    }, { onConflict: 'user_id' });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: prefs, correlation_id: correlationId });
}

import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const BOOLEAN_FIELDS = [
  'email_script_of_day',
  'email_credits_low',
  'email_monthly_summary',
  'email_winner_pattern',
  'email_retainer_milestone',
  'telegram_new_subscriber',
  'telegram_payment_failed',
  'telegram_bug_report',
  'telegram_pipeline_error',
  'telegram_every_script',
] as const;

const DEFAULTS: Record<string, boolean> = {
  email_script_of_day: true,
  email_credits_low: true,
  email_monthly_summary: true,
  email_winner_pattern: false,
  email_retainer_milestone: false,
  telegram_new_subscriber: true,
  telegram_payment_failed: true,
  telegram_bug_report: true,
  telegram_pipeline_error: true,
  telegram_every_script: false,
};

/**
 * GET /api/settings/notifications
 * Returns the user's notification preferences, creating a default row if none exists.
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', auth.user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // No row yet — create default
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('notification_preferences')
      .insert({ user_id: auth.user.id, ...DEFAULTS })
      .select()
      .single();

    if (insertErr) {
      return createApiErrorResponse('DB_ERROR', insertErr.message, 500, correlationId);
    }
    return NextResponse.json({ ok: true, data: inserted });
  }

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * PUT /api/settings/notifications
 * Updates notification preferences. Only accepted boolean fields are written.
 */
export async function PUT(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  // Whitelist only known boolean fields
  const update: Record<string, boolean | string> = { updated_at: new Date().toISOString() };
  for (const field of BOOLEAN_FIELDS) {
    if (typeof body[field] === 'boolean') {
      update[field] = body[field] as boolean;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .upsert(
      { user_id: auth.user.id, ...update },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data });
}

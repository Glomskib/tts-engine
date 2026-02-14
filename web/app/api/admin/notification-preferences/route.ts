import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

const BOOLEAN_FIELDS = [
  // Email
  'email_weekly_report',
  'email_retainer_alerts',
  'email_brief_analyzed',
  'email_video_graded',
  'email_trend_alerts',
  'email_milestone_reached',
  'email_daily_digest',
  'email_script_of_day',
  'email_credits_low',
  'email_monthly_summary',
  'email_winner_pattern',
  'email_retainer_milestone',
  // Push
  'push_new_orders',
  'push_video_posted',
  'push_retainer_deadline',
  'push_engagement_spike',
  // Telegram (legacy)
  'telegram_new_subscriber',
  'telegram_payment_failed',
  'telegram_bug_report',
  'telegram_pipeline_error',
  'telegram_every_script',
] as const;

const STRING_FIELDS = ['digest_frequency', 'timezone'] as const;
const INT_FIELDS = ['quiet_hours_start', 'quiet_hours_end'] as const;

const DEFAULTS: Record<string, any> = {
  email_weekly_report: true,
  email_retainer_alerts: true,
  email_brief_analyzed: true,
  email_video_graded: false,
  email_trend_alerts: true,
  email_milestone_reached: true,
  email_daily_digest: false,
  email_script_of_day: true,
  email_credits_low: true,
  email_monthly_summary: true,
  email_winner_pattern: false,
  email_retainer_milestone: false,
  push_new_orders: true,
  push_video_posted: true,
  push_retainer_deadline: true,
  push_engagement_spike: true,
  telegram_new_subscriber: true,
  telegram_payment_failed: true,
  telegram_bug_report: true,
  telegram_pipeline_error: true,
  telegram_every_script: false,
  digest_frequency: 'weekly',
  timezone: 'America/New_York',
  quiet_hours_start: null,
  quiet_hours_end: null,
};

/**
 * GET /api/admin/notification-preferences
 * Fetch user's notification preferences, creating defaults if missing.
 */
export async function GET(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', auth.user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // No row — create defaults
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('notification_preferences')
      .insert({ user_id: auth.user.id, ...DEFAULTS })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: inserted });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * PUT /api/admin/notification-preferences
 * Update notification preferences. Only whitelisted fields are accepted.
 */
export async function PUT(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  for (const field of BOOLEAN_FIELDS) {
    if (typeof body[field] === 'boolean') {
      update[field] = body[field];
    }
  }

  for (const field of STRING_FIELDS) {
    if (typeof body[field] === 'string') {
      if (field === 'digest_frequency' && !['daily', 'weekly', 'monthly', 'never'].includes(body[field] as string)) {
        continue;
      }
      update[field] = body[field];
    }
  }

  for (const field of INT_FIELDS) {
    if (body[field] === null || (typeof body[field] === 'number' && Number.isInteger(body[field]))) {
      const val = body[field] as number | null;
      if (val === null || (val >= 0 && val <= 23)) {
        update[field] = val;
      }
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

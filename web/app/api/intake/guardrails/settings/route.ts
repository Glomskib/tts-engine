/**
 * GET/PATCH /api/intake/guardrails/settings
 * Per-user intake guardrail settings CRUD.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getUserIntakeSettings } from '@/lib/intake/intake-settings';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getUserIntakeSettings(auth.user.id);
  return NextResponse.json({ ok: true, settings });
}, { routeName: '/api/intake/guardrails/settings', feature: 'drive-intake' });

const ALLOWED_FIELDS = [
  'max_file_mb',
  'max_video_minutes',
  'allowed_mime_prefixes',
  'monthly_file_cap',
  'monthly_minutes_cap',
  'daily_file_cap',
  'daily_minutes_cap',
  'monthly_cost_cap_usd',
  'require_approval_above_mb',
  'require_approval_above_min',
  'is_active',
];

export const PATCH = withErrorCapture(async (request: Request) => {
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

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  // Upsert — create row if it doesn't exist
  const { error } = await supabaseAdmin
    .from('drive_intake_settings')
    .upsert(
      { user_id: auth.user.id, ...updates },
      { onConflict: 'user_id' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: Object.keys(updates).filter(k => k !== 'updated_at') });
}, { routeName: '/api/intake/guardrails/settings', feature: 'drive-intake' });

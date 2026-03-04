/**
 * GET /api/intake/guardrails/usage?months=3
 * Returns monthly intake usage rollups for the current user.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const months = Math.min(parseInt(url.searchParams.get('months') || '3', 10), 12);

  const { data: rollups, error } = await supabaseAdmin
    .from('drive_intake_usage_rollups')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('month', { ascending: false })
    .limit(months);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rollups: rollups || [] });
}, { routeName: '/api/intake/guardrails/usage', feature: 'drive-intake' });

/**
 * /api/affiliate/my-collabs — list the user's affiliate_collaborations rows.
 *
 * Backed by the local table; falls back to live API if available + sync flag set.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAffiliateConfigured } from '@/lib/tiktok-affiliate';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('affiliate_collaborations')
    .select('id, product_id, product_title, status, sample_status, commission_rate, requested_at, accepted_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rows: rows || [],
    notice: isAffiliateConfigured() ? null
      : 'Affiliate API not yet enabled — showing only locally-tracked collabs.',
  });
}

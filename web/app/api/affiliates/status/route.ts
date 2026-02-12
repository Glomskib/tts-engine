import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAffiliateDashboard } from '@/lib/affiliates';
import { getReferralStats } from '@/lib/referrals';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [dashboard, referralStats] = await Promise.all([
      getAffiliateDashboard(user.id),
      getReferralStats(user.id),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        ...dashboard,
        referralStats,
      },
    });
  } catch (err) {
    console.error('Affiliate status error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to load affiliate data' }, { status: 500 });
  }
}

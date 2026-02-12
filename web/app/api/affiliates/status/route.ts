import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getAffiliateDashboard } from '@/lib/affiliates';
import { getReferralStats } from '@/lib/referrals';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const [dashboard, referralStats] = await Promise.all([
      getAffiliateDashboard(auth.user.id),
      getReferralStats(auth.user.id),
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

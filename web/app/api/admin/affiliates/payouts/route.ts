/**
 * GET /api/admin/affiliates/payouts
 * List affiliate payouts with affiliate email, grouped by month.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function isAdminUser(userId: string): Promise<boolean> {
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim());
  if (adminUsers.includes(userId)) return true;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return !!data?.user?.email && adminUsers.includes(data.user.email);
}

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user || !(await isAdminUser(auth.user.id))) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  const { data: payouts, error, count } = await supabaseAdmin
    .from('affiliate_payouts')
    .select('*, affiliate_accounts!inner(user_id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Enrich with affiliate email
  const enriched = await Promise.all(
    (payouts || []).map(async (p) => {
      const affiliateUserId = (p.affiliate_accounts as { user_id: string })?.user_id;
      let affiliateEmail: string | null = null;
      if (affiliateUserId) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(affiliateUserId);
        affiliateEmail = userData?.user?.email || null;
      }
      const { affiliate_accounts, ...rest } = p;
      return {
        ...rest,
        affiliate_email: affiliateEmail,
        month: rest.period_start ? new Date(rest.period_start).toISOString().slice(0, 7) : null,
      };
    })
  );

  return NextResponse.json({ ok: true, data: enriched, total: count, page, limit });
}

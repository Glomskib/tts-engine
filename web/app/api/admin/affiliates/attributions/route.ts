/**
 * GET /api/admin/affiliates/attributions
 * List affiliate attributions with email enrichment.
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

  const { data: attributions, error, count } = await supabaseAdmin
    .from('ff_affiliate_attributions')
    .select('*', { count: 'exact' })
    .order('signup_ts', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Enrich with emails
  const enriched = await Promise.all(
    (attributions || []).map(async (a) => {
      const [affiliateUser, referredUser] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(a.affiliate_user_id),
        supabaseAdmin.auth.admin.getUserById(a.referred_user_id),
      ]);
      return {
        ...a,
        affiliate_email: affiliateUser.data?.user?.email || null,
        referred_email: referredUser.data?.user?.email || null,
      };
    })
  );

  return NextResponse.json({ ok: true, data: enriched, total: count, page, limit });
}

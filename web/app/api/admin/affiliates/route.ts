import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function isAdminUser(userId: string): Promise<boolean> {
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim());
  // Check by ID
  if (adminUsers.includes(userId)) return true;
  // Check by email
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return !!data?.user?.email && adminUsers.includes(data.user.email);
}

/**
 * GET /api/admin/affiliates
 * List all affiliate accounts with user emails.
 */
export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user || !(await isAdminUser(auth.user.id))) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const { data: affiliates, error } = await supabaseAdmin
    .from('affiliate_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Enrich with user emails
  const enriched = await Promise.all(
    (affiliates || []).map(async (a) => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
      return { ...a, email: userData?.user?.email || null };
    })
  );

  return NextResponse.json({ ok: true, data: enriched });
}

/**
 * PATCH /api/admin/affiliates
 * Approve, reject, or suspend an affiliate.
 */
export async function PATCH(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user || !(await isAdminUser(auth.user.id))) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  let body: { affiliateId: string; action: 'approve' | 'reject' | 'suspend' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const statusMap: Record<string, string> = {
    approve: 'approved',
    reject: 'rejected',
    suspend: 'suspended',
  };

  const newStatus = statusMap[body.action];
  if (!newStatus) {
    return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (body.action === 'approve') {
    updateData.approved_at = new Date().toISOString();
    updateData.approved_by = auth.user.id;
  }

  const { error } = await supabaseAdmin
    .from('affiliate_accounts')
    .update(updateData)
    .eq('id', body.affiliateId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

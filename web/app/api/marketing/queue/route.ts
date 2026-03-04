/**
 * API: Marketing Queue — List + manage marketing posts.
 *
 * GET  /api/marketing/queue?status=pending&brand=Making+Miles+Matter&limit=50
 * POST /api/marketing/queue  (body: { id, action: 'retry' | 'cancel' | 'approve' })
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');
  const brand = searchParams.get('brand');
  const source = searchParams.get('source');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabaseAdmin
    .from('marketing_posts')
    .select('id, content, status, source, platforms, claim_risk_score, claim_risk_flags, late_post_id, error, meta, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (brand) query = query.filter('meta->brand', 'eq', JSON.stringify(brand));
  if (source) query = query.eq('source', source);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    posts: data || [],
    total: count || 0,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 });
  }

  let body: { id: string; action: 'retry' | 'cancel' | 'approve' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  const { data: post } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, status, meta')
    .eq('id', body.id)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  switch (body.action) {
    case 'retry':
      if (post.status !== 'failed') {
        return NextResponse.json({ error: 'Can only retry failed posts' }, { status: 400 });
      }
      await supabaseAdmin.from('marketing_posts').update({
        meta: { ...(post.meta || {}), retry_requested: true, retry_flagged_at: now },
        updated_at: now,
      }).eq('id', body.id);
      return NextResponse.json({ ok: true, action: 'retry_flagged' });

    case 'cancel':
      if (post.status === 'published' || post.status === 'scheduled') {
        return NextResponse.json({ error: 'Cannot cancel published/scheduled posts' }, { status: 400 });
      }
      await supabaseAdmin.from('marketing_posts').update({
        status: 'cancelled',
        error: 'Cancelled by admin',
        updated_at: now,
      }).eq('id', body.id);
      return NextResponse.json({ ok: true, action: 'cancelled' });

    case 'approve':
      if (post.status !== 'pending') {
        return NextResponse.json({ error: 'Can only approve pending posts' }, { status: 400 });
      }
      await supabaseAdmin.from('marketing_posts').update({
        meta: { ...(post.meta || {}), needs_review: false, approved_at: now, approved_by: authContext.user.email },
        updated_at: now,
      }).eq('id', body.id);
      return NextResponse.json({ ok: true, action: 'approved' });

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

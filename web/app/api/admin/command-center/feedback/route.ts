/**
 * GET /api/admin/command-center/feedback
 *
 * Owner-only. Returns feedback items + aggregate stats.
 * Query params: status, type, priority, limit
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { FeedbackStats } from '@/lib/command-center/feedback-types';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const priority = searchParams.get('priority');
  const limitParam = parseInt(searchParams.get('limit') || '200', 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  try {
    let query = supabaseAdmin
      .from('ff_feedback_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all') query = query.eq('type', type);
    if (priority && priority !== 'all') query = query.eq('priority', parseInt(priority, 10));

    const [itemsRes, statsRes] = await Promise.all([
      query,
      supabaseAdmin
        .from('ff_feedback_items')
        .select('status, type'),
    ]);

    const items = itemsRes.data || [];
    const allRows = statsRes.data || [];

    const stats: FeedbackStats = {
      total: allRows.length,
      new: allRows.filter((r) => r.status === 'new').length,
      bugs: allRows.filter((r) => r.type === 'bug').length,
      features: allRows.filter((r) => r.type === 'feature').length,
    };

    return NextResponse.json({ ok: true, data: items, stats });
  } catch (err) {
    console.error('[api/admin/command-center/feedback] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

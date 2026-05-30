/**
 * GET /api/marketing/pending
 *
 * Lists marketing posts awaiting Brandon's approval. Used by:
 *   - mc-post pending  (CLI)
 *   - the weekly-approval admin view
 *   - Telegram approval bot
 *
 * Filters down to the rows that actually matter: status='pending' AND
 * meta.approved is not true AND meta.rejected is not true. Optionally
 * scoped by brand or platform.
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
 *
 * Query:
 *   brand?      "Making Miles Matter" | "Zebby's World" | "FlashFlow"
 *   platform?   facebook | twitter | ...
 *   limit?      1..100 (default 30)
 *
 * Returns: {
 *   ok, count,
 *   posts: [{ id, content_preview, content, platforms, source,
 *             claim_risk_score, claim_risk_flags, scheduled_for,
 *             created_at, meta }],
 *   autopublish_env: 'on' | 'off',
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';

export const runtime = 'nodejs';

async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  if (serviceToken) {
    const authHeader = request.headers.get('authorization');
    const serviceAuth =
      request.headers.get('x-service-token') || request.headers.get('x-mc-token');
    if (authHeader === `Bearer ${serviceToken}` || serviceAuth === serviceToken) {
      return null;
    }
  }
  return requireOwner(request);
}

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand');
  const platform = searchParams.get('platform');
  const limitRaw = parseInt(searchParams.get('limit') || '30', 10);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 30, 100));

  let query = supabaseAdmin
    .from('marketing_posts')
    .select(
      'id, content, platforms, source, claim_risk_score, claim_risk_flags, scheduled_for, created_at, meta',
      { count: 'exact' },
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (brand) query = query.filter('meta->brand', 'eq', JSON.stringify(brand));

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter out already-approved or rejected posts (the cron's belt-and-suspenders
  // would skip these anyway, but keep the queue view clean).
  const filtered = (data || []).filter((row) => {
    const m = (row.meta as Record<string, unknown> | null) || {};
    if (m.approved === true) return false;
    if (m.rejected === true) return false;
    if (platform) {
      const platforms = row.platforms as Array<{ platform?: string } | string> | null;
      if (!Array.isArray(platforms)) return false;
      const hit = platforms.some((p) => {
        if (typeof p === 'string') return p === platform;
        if (p && typeof p === 'object') return p.platform === platform;
        return false;
      });
      if (!hit) return false;
    }
    return true;
  });

  const posts = filtered.map((row) => ({
    id: row.id,
    content_preview: typeof row.content === 'string' ? row.content.slice(0, 140) : '',
    content: row.content,
    platforms: row.platforms,
    source: row.source,
    claim_risk_score: row.claim_risk_score,
    claim_risk_flags: row.claim_risk_flags,
    scheduled_for: row.scheduled_for,
    created_at: row.created_at,
    meta: row.meta,
  }));

  return NextResponse.json({
    ok: true,
    count: posts.length,
    total_pending_rows: count || 0,
    autopublish_env: process.env.MARKETING_AUTOPUBLISH === 'on' ? 'on' : 'off',
    posts,
  });
}

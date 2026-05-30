/**
 * POST /api/marketing/posts/:id/retarget
 *
 * Rewires a pending marketing_posts row to a different target page (or
 * set of pages). Pivots content from one account to another without
 * re-generating it.
 *
 * Body:
 *   {
 *     target_brand: string,         // a brand from marketing_brand_accounts
 *     target_platforms?: string[]   // optional filter — default = facebook only
 *   }
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
 * Refuses to retarget rows that already shipped (status in
 *   published/scheduled with late_post_id set).
 *
 * Side effects:
 *   - Replaces row.platforms with the new resolved PlatformTarget[]
 *   - Updates meta.brand, meta.target_page_name, meta.target_page_id
 *   - Records meta.retargeted_at, meta.retargeted_from (prior brand)
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { resolveTargets } from '@/lib/marketing/brand-accounts';
import type { LatePlatform } from '@/lib/marketing/types';

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

interface RetargetBody {
  target_brand?: string;
  target_platforms?: string[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'post id required' }, { status: 400 });

  let body: RetargetBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const targetBrand = typeof body.target_brand === 'string' ? body.target_brand.trim() : '';
  if (!targetBrand) {
    return NextResponse.json({ error: 'target_brand is required' }, { status: 400 });
  }

  const platforms = (
    Array.isArray(body.target_platforms) && body.target_platforms.length > 0
      ? body.target_platforms
      : ['facebook']
  ) as LatePlatform[];

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, status, late_post_id, platforms, meta')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: `post ${id} not found` }, { status: 404 });

  if (
    existing.status === 'published' ||
    existing.status === 'scheduled' ||
    existing.late_post_id
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot retarget — post is at status="${existing.status}"${
          existing.late_post_id ? ` and already scheduled in Late (${existing.late_post_id})` : ''
        }.`,
      },
      { status: 409 },
    );
  }

  const newTargets = await resolveTargets(targetBrand, platforms);
  if (newTargets.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `No enabled brand_account rows found for brand="${targetBrand}" platform(s)=${platforms.join(',')}.`,
      },
      { status: 422 },
    );
  }

  const existingMeta = (existing.meta as Record<string, unknown> | null) || {};
  const newMeta = {
    ...existingMeta,
    brand: targetBrand,
    target_page_name: targetBrand,
    target_page_id: newTargets[0]?.platformSpecificData?.pageId || null,
    retargeted_at: new Date().toISOString(),
    retargeted_from: existingMeta.brand || existingMeta.target_page_name || null,
  };

  const { error: updateErr } = await supabaseAdmin
    .from('marketing_posts')
    .update({
      platforms: newTargets,
      meta: newMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    post_id: id,
    new_target_brand: targetBrand,
    new_targets: newTargets,
    note: 'Post platforms + meta updated. Approval status preserved — if it was approved before, it will still ship to the NEW page on next cron.',
  });
}

/**
 * GET /api/marketing/brand-options
 *
 * Returns every enabled brand_account row as a flat list of options for
 * the "Move post to..." dropdown in the admin queue UI.
 *
 * Each option includes: brand (page name), platform, account_id, page_id,
 * parent_brand (umbrella), and a display label like
 * "Spoonie Survival Tips (Zebby's World / facebook)".
 *
 * Auth: owner session OR Bearer MISSION_CONTROL_TOKEN.
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

interface BrandAccountRow {
  brand: string;
  platform: string;
  account_id: string;
  page_id: string | null;
  enabled: boolean;
  meta: Record<string, unknown> | null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from('marketing_brand_accounts')
    .select('brand, platform, account_id, page_id, enabled, meta')
    .eq('enabled', true)
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as BrandAccountRow[];
  const options = rows.map((r) => {
    const meta = r.meta || {};
    const parent =
      (meta.parent_brand as string | undefined) || null;
    const labelParts: string[] = [r.brand];
    if (parent) labelParts.push(`(${parent} / ${r.platform})`);
    else labelParts.push(`(${r.platform})`);
    return {
      key: `${r.brand}::${r.platform}::${r.page_id ?? ''}`,
      brand: r.brand,
      platform: r.platform,
      account_id: r.account_id,
      page_id: r.page_id,
      parent_brand: parent,
      label: labelParts.join(' '),
    };
  });

  // Group by umbrella for nicer dropdown rendering
  const byUmbrella: Record<string, typeof options> = {};
  for (const o of options) {
    const k = o.parent_brand || o.brand;
    byUmbrella[k] = byUmbrella[k] || [];
    byUmbrella[k].push(o);
  }

  return NextResponse.json({
    ok: true,
    count: options.length,
    options,
    by_umbrella: byUmbrella,
  });
}

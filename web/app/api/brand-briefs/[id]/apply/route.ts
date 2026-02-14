import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: brief, error } = await supabaseAdmin
    .from('brand_briefs')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();

  if (error || !brief) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  if (brief.status !== 'ready') {
    return NextResponse.json({ error: 'Brief must be analyzed first' }, { status: 400 });
  }

  if (!brief.brand_id) {
    return NextResponse.json({ error: 'No brand linked to this brief' }, { status: 400 });
  }

  const analysis = brief.ai_analysis || {};
  const gmvBonuses = brief.gmv_bonuses || [];
  const retainerType = brief.brief_type === 'retainer' ? 'retainer' : 'bonus';

  // Build bonus tiers from GMV bonuses
  const bonusTiers = (gmvBonuses as Array<{ tier_label: string; min_gmv: number; payout: number }>).map((b) => ({
    label: b.tier_label,
    gmv: b.min_gmv,
    bonus: b.payout,
  }));

  const targetProjection = (brief.income_projections as Record<string, { videos?: number; posting_bonus?: number }>)?.target;

  const { error: updateErr } = await supabaseAdmin
    .from('brands')
    .update({
      retainer_type: retainerType,
      retainer_video_goal: brief.min_videos || targetProjection?.videos || 15,
      retainer_payout_amount: targetProjection?.posting_bonus || 0,
      retainer_bonus_tiers: bonusTiers,
      retainer_period_start: brief.campaign_start,
      retainer_period_end: brief.campaign_end,
      retainer_notes: (analysis as Record<string, string>).summary || '',
    })
    .eq('id', brief.brand_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await supabaseAdmin
    .from('brand_briefs')
    .update({ status: 'applied', applied_to_brand: true })
    .eq('id', id);

  return NextResponse.json({ ok: true });
}

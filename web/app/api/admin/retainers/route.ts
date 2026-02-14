import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch brands with retainers
  const { data: brands } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('user_id', auth.user.id)
    .not('retainer_type', 'is', null)
    .not('retainer_type', 'eq', 'none');

  if (!brands || brands.length === 0) {
    return NextResponse.json({ retainers: [], summary: { total_brands: 0, total_base: 0, total_potential: 0, total_videos_needed: 0, brands_on_track: 0, brands_at_risk: 0, brands_completed: 0 } });
  }

  const retainers = [];
  let totalBase = 0;
  let totalPotential = 0;
  let totalVideosNeeded = 0;

  for (const brand of brands) {
    // Count POSTED videos from pipeline
    const { count: pipelineCount } = await supabaseAdmin
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('recording_status', 'POSTED');

    // Count from tiktok_videos if table exists (defensive)
    let tiktokCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from('tiktok_videos')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .is('video_id', null); // Only count ones NOT already in pipeline
      tiktokCount = count || 0;
    } catch { /* table might not exist yet */ }

    const totalPosted = (pipelineCount || 0) + tiktokCount;
    const goal = brand.retainer_video_goal || brand.monthly_video_quota || 0;
    const completion = goal > 0 ? Math.min(100, Math.round((totalPosted / goal) * 100)) : 0;
    const basePayout = brand.retainer_payout_amount || 0;
    totalBase += basePayout;

    // Calculate bonus tier progress
    const tiers = Array.isArray(brand.retainer_bonus_tiers) ? brand.retainer_bonus_tiers : [];
    let bonusEarned = 0;
    let nextBonusAmount = 0;
    let nextBonusNeeded = 0;
    let totalBonusPotential = 0;
    const tierProgress = tiers.map((tier: Record<string, unknown>) => {
      const target = (tier.videos as number) || (tier.gmv as number) || 0;
      const payout = (tier.payout as number) || (tier.bonus as number) || 0;
      totalBonusPotential += payout;
      const hit = totalPosted >= target;
      if (hit) bonusEarned += payout;
      if (!nextBonusAmount && !hit) {
        nextBonusAmount = payout;
        nextBonusNeeded = target - totalPosted;
      }
      return { ...tier, hit, target, payout };
    });
    totalPotential += basePayout + totalBonusPotential;

    // Calculate days remaining and pace
    const periodEnd = brand.retainer_period_end ? new Date(brand.retainer_period_end) : null;
    const periodStart = brand.retainer_period_start ? new Date(brand.retainer_period_start) : null;
    const daysRemaining = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86400000)) : null;
    const daysElapsed = periodStart ? Math.max(1, Math.ceil((Date.now() - periodStart.getTime()) / 86400000)) : null;
    const dailyPace = daysElapsed ? totalPosted / daysElapsed : 0;
    const projectedTotal = daysRemaining !== null && dailyPace > 0 ? Math.round(totalPosted + (dailyPace * daysRemaining)) : totalPosted;
    const videosNeeded = Math.max(0, goal - totalPosted);
    totalVideosNeeded += videosNeeded;

    // Determine status
    let status = 'on_track';
    if (periodEnd && periodEnd.getTime() < Date.now()) status = 'expired';
    else if (completion >= 100) status = 'completed';
    else if (projectedTotal < goal && daysRemaining !== null && daysRemaining < 14) status = 'behind';
    else if (projectedTotal < goal) status = 'at_risk';

    // Check for linked briefs
    let linkedBrief = null;
    try {
      const { data: brief } = await supabaseAdmin
        .from('brand_briefs')
        .select('id, title, status, income_projections')
        .eq('brand_id', brand.id)
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (brief) linkedBrief = brief;
    } catch { /* no briefs table or no briefs */ }

    retainers.push({
      brand_id: brand.id,
      brand_name: brand.name,
      retainer_type: brand.retainer_type,
      period_start: brand.retainer_period_start,
      period_end: brand.retainer_period_end,
      days_remaining: daysRemaining,
      video_goal: goal,
      videos_posted: totalPosted,
      pipeline_posted: pipelineCount || 0,
      tiktok_posted: tiktokCount,
      completion,
      base_payout: basePayout,
      bonus_earned: bonusEarned,
      total_bonus_potential: totalBonusPotential,
      tier_progress: tierProgress,
      next_bonus_amount: nextBonusAmount,
      next_bonus_needed: nextBonusNeeded,
      daily_pace: parseFloat(dailyPace.toFixed(1)),
      projected_total: projectedTotal,
      videos_needed: videosNeeded,
      status,
      notes: brand.retainer_notes || null,
      linked_brief: linkedBrief,
    });
  }

  return NextResponse.json({
    retainers: retainers.sort((a, b) => {
      const statusPriority: Record<string, number> = { behind: 0, at_risk: 1, on_track: 2, completed: 3, expired: 4 };
      return (statusPriority[a.status] || 5) - (statusPriority[b.status] || 5);
    }),
    summary: {
      total_brands: retainers.length,
      total_base: totalBase,
      total_potential: totalPotential,
      total_videos_needed: totalVideosNeeded,
      brands_on_track: retainers.filter(r => r.status === 'on_track').length,
      brands_at_risk: retainers.filter(r => r.status === 'at_risk' || r.status === 'behind').length,
      brands_completed: retainers.filter(r => r.status === 'completed').length,
    },
  });
}

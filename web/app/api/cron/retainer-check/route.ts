/**
 * Cron: Daily Retainer Progress Check — 8 AM ET (13:00 UTC)
 *
 * For each brand with an active retainer:
 *   1. Count POSTED videos in the retainer period
 *   2. Calculate pace vs target
 *   3. If behind pace → warning notification + Telegram
 *   4. If milestone hit (video goal reached) → celebration + Telegram
 *   5. If GMV bonus tier hit → celebration + Telegram
 *   6. If deadline ≤3 days away → urgency alert
 *
 * Deduplication: uses metadata.retainer_check_key to avoid repeat alerts
 * for the same condition on the same day.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramNotification } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface BonusTier {
  videos?: number;
  payout?: number;
  gmv?: number;
  bonus?: number;
  label: string;
}

interface RetainerBrand {
  id: string;
  name: string;
  retainer_type: string;
  retainer_video_goal: number;
  retainer_period_start: string;
  retainer_period_end: string;
  retainer_payout_amount: number;
  retainer_bonus_tiers: BonusTier[];
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 1. Fetch brands with active retainers (period includes today)
    const { data: brands, error: brandsError } = await supabaseAdmin
      .from('brands')
      .select('id, name, retainer_type, retainer_video_goal, retainer_period_start, retainer_period_end, retainer_payout_amount, retainer_bonus_tiers')
      .neq('retainer_type', 'none')
      .not('retainer_type', 'is', null)
      .lte('retainer_period_start', todayStr)
      .gte('retainer_period_end', todayStr);

    if (brandsError) {
      console.error('[retainer-check] Error fetching brands:', brandsError);
      return NextResponse.json({ ok: false, error: brandsError.message }, { status: 500 });
    }

    if (!brands || brands.length === 0) {
      return NextResponse.json({ ok: true, message: 'No active retainers', processed: 0 });
    }

    // 2. Get all admin user IDs (to target notifications)
    const { data: admins } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('role', 'admin');
    const adminIds = (admins || []).map(a => a.user_id);

    if (adminIds.length === 0) {
      console.warn('[retainer-check] No admin users found');
      return NextResponse.json({ ok: true, message: 'No admins to notify', processed: 0 });
    }

    const results: { brand: string; videosPosted: number; alerts: string[] }[] = [];

    for (const brand of brands as RetainerBrand[]) {
      const alerts: string[] = [];

      // 3. Count POSTED videos for this brand in the retainer period
      //    Path: videos.product_id → products.brand_id = brand.id
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('brand_id', brand.id);

      const productIds = (products || []).map(p => p.id);

      let videosPosted = 0;
      if (productIds.length > 0) {
        const { count } = await supabaseAdmin
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .in('product_id', productIds)
          .eq('recording_status', 'POSTED')
          .gte('created_at', brand.retainer_period_start)
          .lte('created_at', brand.retainer_period_end + 'T23:59:59Z');

        videosPosted = count || 0;
      }

      // 4. Calculate pace
      const periodStart = new Date(brand.retainer_period_start);
      const periodEnd = new Date(brand.retainer_period_end);
      const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
      const daysElapsed = Math.max(1, Math.ceil((today.getTime() - periodStart.getTime()) / 86400000));
      const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - today.getTime()) / 86400000));
      const videosRemaining = Math.max(0, brand.retainer_video_goal - videosPosted);
      const paceNeeded = daysRemaining > 0 ? videosRemaining / daysRemaining : videosRemaining;
      const expectedByNow = Math.round((daysElapsed / totalDays) * brand.retainer_video_goal);
      const isBehind = videosPosted < expectedByNow;

      // 5. Check milestones
      const bonusTiers = brand.retainer_bonus_tiers || [];
      const videoGoalMet = videosPosted >= brand.retainer_video_goal;

      // --- ALERTS ---

      // A. Deadline approaching (≤3 days left) and not yet complete
      if (daysRemaining <= 3 && daysRemaining > 0 && !videoGoalMet) {
        const key = `deadline-${brand.id}-${todayStr}`;
        if (await isNewAlert(key)) {
          const msg = `⏰ ${brand.name}: Only ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left! ${videosRemaining} videos to go. Need ${paceNeeded.toFixed(1)}/day.`;
          alerts.push(msg);
          await createAdminNotifications(adminIds, 'brand_quota', `${brand.name} — Deadline Alert`, msg, `/admin/brands`, { retainer_check_key: key, brand_id: brand.id });
          await sendTelegramNotification(msg);
        }
      }

      // B. Behind pace (not in final 3 days — those get deadline alert instead)
      if (isBehind && daysRemaining > 3) {
        const key = `behind-${brand.id}-${todayStr}`;
        if (await isNewAlert(key)) {
          const msg = `⚠️ ${brand.name}: Falling behind! ${videosPosted}/${brand.retainer_video_goal} posted (expected ${expectedByNow} by now). Need ${paceNeeded.toFixed(1)} videos/day to hit goal.`;
          alerts.push(msg);
          await createAdminNotifications(adminIds, 'brand_quota', `${brand.name} — Behind Pace`, msg, `/admin/brands`, { retainer_check_key: key, brand_id: brand.id });
          await sendTelegramNotification(msg);
        }
      }

      // C. On track status update (daily summary if on track, no alert spam — only on pace)
      if (!isBehind && !videoGoalMet && daysRemaining > 3) {
        const key = `ontrack-${brand.id}-${todayStr}`;
        if (await isNewAlert(key)) {
          const msg = `🌿 ${brand.name}: ${daysRemaining} days left, ${videosRemaining} videos to go. Pace: ${paceNeeded.toFixed(1)}/day needed.`;
          alerts.push(msg);
          await createAdminNotifications(adminIds, 'info', `${brand.name} — On Track`, msg, `/admin/brands`, { retainer_check_key: key, brand_id: brand.id });
          // On-track is info only — no Telegram spam
        }
      }

      // D. Video goal milestone hit
      if (videoGoalMet) {
        const key = `milestone-videos-${brand.id}`;
        if (await isNewAlert(key)) {
          const payoutStr = brand.retainer_payout_amount > 0 ? ` $${brand.retainer_payout_amount} retainer earned!` : '';
          const msg = `🎉 ${brand.name}: ${videosPosted} videos complete!${payoutStr}`;
          alerts.push(msg);
          await createAdminNotifications(adminIds, 'info', `${brand.name} — Goal Reached!`, msg, `/admin/brands`, { retainer_check_key: key, brand_id: brand.id });
          await sendTelegramNotification(msg);
        }
      }

      // E. GMV bonus tiers (check each tier)
      // Note: GMV data would come from TikTok Shop orders or a GMV tracking field.
      // For now, we check if there's a gmv field on the brand.
      for (const tier of bonusTiers) {
        if (tier.gmv && tier.bonus) {
          // Look for a brand-level GMV tracker (brand might have a gmv_total field,
          // or we aggregate from tiktok_shop_orders). Skip if no data source.
          // This is a placeholder — actual GMV tracking needs a data source.
          // We'll check a metadata approach: brand could have a `current_gmv` in retainer_bonus_tiers metadata
        }
      }

      results.push({ brand: brand.name, videosPosted, alerts });
    }

    const totalAlerts = results.reduce((acc, r) => acc + r.alerts.length, 0);

    return NextResponse.json({
      ok: true,
      processed: results.length,
      alerts_sent: totalAlerts,
      results,
    });
  } catch (error) {
    console.error('[retainer-check] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Check if an alert with the given key has already been sent.
 * Uses the notifications table metadata to deduplicate.
 */
async function isNewAlert(key: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>retainer_check_key', key);
  return (count || 0) === 0;
}

/**
 * Create a notification for all admin users.
 */
async function createAdminNotifications(
  adminIds: string[],
  type: string,
  title: string,
  message: string,
  actionUrl: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const rows = adminIds.map(userId => ({
    user_id: userId,
    type,
    title,
    message,
    action_url: actionUrl,
    metadata,
    read: false,
    is_read: false,
  }));

  const { error } = await supabaseAdmin
    .from('notifications')
    .insert(rows);

  if (error) {
    console.error('[retainer-check] Failed to insert notifications:', error);
  }
}

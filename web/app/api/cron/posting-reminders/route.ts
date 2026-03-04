/**
 * Cron: Posting Reminders — every 15 min
 *
 * Finds videos scheduled today with a scheduled_time within the next N minutes
 * (per user preference) that have no final_video_url yet, and creates
 * in-app notifications reminding the user to upload.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Get all videos scheduled today with a time set and no final video
    const { data: videos, error: vErr } = await supabaseAdmin
      .from('videos')
      .select('id, client_user_id, product_id, scheduled_time, final_video_url')
      .eq('scheduled_date', todayKey)
      .not('scheduled_time', 'is', null)
      .is('final_video_url', null);

    if (vErr) {
      console.error('[posting-reminders] Error fetching videos:', vErr);
      return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 });
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, reason: 'no_upcoming_videos' });
    }

    // Get product names for the notification message
    const productIds = [...new Set(videos.map(v => v.product_id).filter(Boolean))];
    let productMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name')
        .in('id', productIds);
      if (products) {
        productMap = Object.fromEntries(products.map(p => [p.id, p.name]));
      }
    }

    // Collect unique user IDs to fetch their preferences
    const userIds = [...new Set(videos.map(v => v.client_user_id))];
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, posting_reminders_enabled, posting_reminder_lead_minutes')
      .in('user_id', userIds);

    const prefMap: Record<string, { enabled: boolean; leadMin: number }> = {};
    for (const p of prefs || []) {
      prefMap[p.user_id] = {
        enabled: p.posting_reminders_enabled !== false, // default true
        leadMin: p.posting_reminder_lead_minutes || 30,
      };
    }

    // Check recent notifications to avoid duplicates (created in last hour)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: recentNotifs } = await supabaseAdmin
      .from('notifications')
      .select('metadata')
      .eq('type', 'system')
      .gte('created_at', oneHourAgo)
      .like('title', '%posts in%');

    const alreadyNotified = new Set<string>();
    for (const n of recentNotifs || []) {
      const videoId = (n.metadata as any)?.video_id;
      if (videoId) alreadyNotified.add(videoId);
    }

    let notified = 0;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const video of videos) {
      if (alreadyNotified.has(video.id)) continue;

      const userPref = prefMap[video.client_user_id] || { enabled: true, leadMin: 30 };
      if (!userPref.enabled) continue;

      // Parse scheduled_time (HH:MM or HH:MM:SS)
      const [hStr, mStr] = video.scheduled_time.split(':');
      const scheduledMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
      const minutesUntil = scheduledMinutes - nowMinutes;

      // Only notify if within the lead window (0 to leadMin)
      if (minutesUntil < 0 || minutesUntil > userPref.leadMin) continue;

      const productName = video.product_id ? (productMap[video.product_id] || 'Video') : 'Video';
      const timeLabel = minutesUntil <= 5 ? 'now' : `in ${minutesUntil} min`;

      const { error: insertErr } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: video.client_user_id,
          type: 'system',
          title: `"${productName}" posts ${timeLabel} — upload now`,
          message: `Your scheduled video has no uploaded final video yet. Upload before posting time.`,
          action_url: `/admin/pipeline?video=${video.id}`,
          metadata: { video_id: video.id, reminder_type: 'posting_upload' },
          read: false,
          is_read: false,
        });

      if (!insertErr) notified++;
    }

    return NextResponse.json({ ok: true, notified, checked: videos.length });
  } catch (err) {
    console.error('[posting-reminders] Error:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * POST /api/videos/[id]/auto-schedule
 * Automatically schedules a video for posting based on user preferences.
 * Called when a video is marked READY_TO_POST.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: videoId } = await params;

  // 1. Fetch the video to get its title/details
  const { data: video, error: videoError } = await supabaseAdmin
    .from('videos')
    .select('id, variant_id, recording_status, google_drive_url')
    .eq('id', videoId)
    .single();

  if (videoError || !video) {
    return NextResponse.json({ ok: false, error: 'Video not found' }, { status: 404 });
  }

  // 2. Fetch user's posting preferences
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('settings')
    .eq('id', authContext.user.id)
    .single();

  const settings = profile?.settings as Record<string, unknown> | null;
  const posting = (settings?.posting || {}) as Record<string, unknown>;
  const videosPerDay = (posting.videos_per_day as number) || 1;
  const postingTime1 = (posting.posting_time_1 as string) || '09:00';
  const postingTime2 = (posting.posting_time_2 as string) || '18:00';
  const postingTimes = [postingTime1, postingTime2].slice(0, videosPerDay);

  // 3. Get existing scheduled posts for next 30 days
  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const { data: existingPosts } = await supabaseAdmin
    .from('scheduled_posts')
    .select('id, scheduled_for')
    .eq('user_id', authContext.user.id)
    .in('status', ['scheduled'])
    .gte('scheduled_for', now.toISOString())
    .lte('scheduled_for', thirtyDaysOut.toISOString());

  // 4. Find next available slot
  const scheduled = existingPosts || [];
  let scheduleDate = new Date();
  // Start from tomorrow if today is mostly over (past 3pm)
  if (scheduleDate.getHours() >= 15) {
    scheduleDate.setDate(scheduleDate.getDate() + 1);
  }

  let scheduledTime: Date | null = null;

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const checkDate = new Date(scheduleDate);
    checkDate.setDate(scheduleDate.getDate() + dayOffset);
    const dateStr = checkDate.toISOString().split('T')[0];

    // Count posts already scheduled for this day
    const postsOnDay = scheduled.filter(p => {
      const pDate = new Date(p.scheduled_for).toISOString().split('T')[0];
      return pDate === dateStr;
    }).length;

    if (postsOnDay < videosPerDay) {
      // Found a slot - use the next available posting time
      const timeToUse = postingTimes[postsOnDay] || postingTimes[0];
      const [hours, minutes] = timeToUse.split(':').map(Number);
      const slotDate = new Date(checkDate);
      slotDate.setHours(hours, minutes, 0, 0);

      // Make sure the slot is in the future
      if (slotDate > now) {
        scheduledTime = slotDate;
        break;
      }
    }
  }

  if (!scheduledTime) {
    return NextResponse.json({
      ok: false,
      error: 'No available posting slots in the next 30 days',
    }, { status: 409 });
  }

  // 5. Create scheduled post
  const { data: post, error: postError } = await supabaseAdmin
    .from('scheduled_posts')
    .insert({
      user_id: authContext.user.id,
      title: `Video ${video.variant_id || videoId.slice(0, 8)}`,
      description: `Auto-scheduled from pipeline`,
      scheduled_for: scheduledTime.toISOString(),
      platform: 'tiktok',
      status: 'scheduled',
      metadata: { video_id: videoId, auto_scheduled: true },
    })
    .select()
    .single();

  if (postError) {
    console.error('Failed to auto-schedule video:', postError);
    return NextResponse.json({ ok: false, error: 'Failed to create scheduled post' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: post,
    scheduled_for: scheduledTime.toISOString(),
  });
}

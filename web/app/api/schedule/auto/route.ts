import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface ScheduleSlot {
  account_id: string;
  account_name: string;
  scheduled_date: string;
  scheduled_time: string;
  reason: string;
}

interface VideoToSchedule {
  id: string;
  video_code: string | null;
  product_name: string | null;
  brand_name: string | null;
  recording_status: string | null;
  posting_account_id: string | null;
}

// Optimal TikTok posting times (ET)
const OPTIMAL_TIMES = ['07:00', '10:00', '12:00', '15:00', '19:00', '21:00'];

/**
 * POST /api/schedule/auto
 * Auto-schedule ready-to-post videos across posting accounts
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: { days_ahead?: number; max_per_day?: number; dry_run?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const daysAhead = Math.min(body.days_ahead || 7, 30);
  const maxPerDay = Math.min(body.max_per_day || 3, 10);
  const dryRun = body.dry_run !== false; // default to dry run for safety

  // Get ready-to-post videos
  const { data: readyVideos, error: videosError } = await supabaseAdmin
    .from('videos')
    .select('id, video_code, product_id, recording_status, posting_account_id')
    .eq('recording_status', 'READY_TO_POST')
    .order('created_at', { ascending: true })
    .limit(50);

  if (videosError) {
    return createApiErrorResponse('DB_ERROR', videosError.message, 500, correlationId);
  }

  if (!readyVideos || readyVideos.length === 0) {
    return NextResponse.json({
      ok: true,
      data: { scheduled: [], message: 'No videos ready to post' },
      correlation_id: correlationId,
    });
  }

  // Get posting accounts
  const { data: accounts } = await supabaseAdmin
    .from('posting_accounts')
    .select('id, name, platform, daily_post_limit')
    .eq('is_active', true);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      ok: true,
      data: { scheduled: [], message: 'No active posting accounts' },
      correlation_id: correlationId,
    });
  }

  // Get product names for context
  const productIds = readyVideos.map(v => v.product_id).filter(Boolean);
  const { data: products } = productIds.length > 0
    ? await supabaseAdmin.from('products').select('id, name, brand').in('id', productIds)
    : { data: [] };

  const productMap = new Map((products || []).map(p => [p.id, p]));

  // Get existing scheduled posts to avoid conflicts
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysAhead);

  const { data: existingPosts } = await supabaseAdmin
    .from('scheduled_posts')
    .select('posting_account_id, scheduled_date')
    .gte('scheduled_date', startDate.toISOString().split('T')[0])
    .lte('scheduled_date', endDate.toISOString().split('T')[0]);

  // Count existing posts per account per day
  const postCounts: Record<string, Record<string, number>> = {};
  for (const post of existingPosts || []) {
    const key = post.posting_account_id;
    const date = post.scheduled_date;
    if (!postCounts[key]) postCounts[key] = {};
    postCounts[key][date] = (postCounts[key][date] || 0) + 1;
  }

  // Schedule algorithm: round-robin across accounts, spread across days
  const scheduled: Array<{
    video_id: string;
    video_code: string | null;
    product_name: string | null;
    slot: ScheduleSlot;
  }> = [];

  let accountIndex = 0;
  let dayOffset = 0;
  let timeIndex = 0;

  for (const video of readyVideos) {
    if (dayOffset >= daysAhead) break;

    // Find next available slot
    let slotFound = false;
    let attempts = 0;

    while (!slotFound && attempts < accounts.length * daysAhead) {
      attempts++;
      const account = accounts[accountIndex % accounts.length];
      const schedDate = new Date(startDate);
      schedDate.setDate(schedDate.getDate() + dayOffset);
      const dateStr = schedDate.toISOString().split('T')[0];

      const dailyLimit = account.daily_post_limit || maxPerDay;
      const currentCount = postCounts[account.id]?.[dateStr] || 0;

      if (currentCount < dailyLimit && currentCount < maxPerDay) {
        const product = video.product_id ? productMap.get(video.product_id) : null;

        const slot: ScheduleSlot = {
          account_id: account.id,
          account_name: account.name,
          scheduled_date: dateStr,
          scheduled_time: OPTIMAL_TIMES[timeIndex % OPTIMAL_TIMES.length],
          reason: `Round-robin distribution, slot ${currentCount + 1}/${dailyLimit}`,
        };

        scheduled.push({
          video_id: video.id,
          video_code: video.video_code,
          product_name: product?.name || null,
          slot,
        });

        // Update counts
        if (!postCounts[account.id]) postCounts[account.id] = {};
        postCounts[account.id][dateStr] = currentCount + 1;

        slotFound = true;
        timeIndex++;
      }

      accountIndex++;
      if (accountIndex % accounts.length === 0) {
        dayOffset++;
      }
    }
  }

  // If not dry run, create scheduled_posts entries
  if (!dryRun && scheduled.length > 0) {
    const inserts = scheduled.map(s => ({
      video_id: s.video_id,
      posting_account_id: s.slot.account_id,
      scheduled_date: s.slot.scheduled_date,
      scheduled_time: s.slot.scheduled_time,
      status: 'scheduled',
      created_by: authContext.user!.id,
    }));

    await supabaseAdmin.from('scheduled_posts').insert(inserts);
  }

  return NextResponse.json({
    ok: true,
    data: {
      scheduled,
      total_scheduled: scheduled.length,
      total_ready: readyVideos.length,
      days_ahead: daysAhead,
      dry_run: dryRun,
      accounts_used: [...new Set(scheduled.map(s => s.slot.account_name))],
    },
    correlation_id: correlationId,
  });
}

/**
 * API: Smart Schedule Suggestion
 *
 * GET /api/ai/schedule-suggest — suggest best posting time and day
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Get posted content with timestamps and performance
  const { data: posts } = await supabaseAdmin
    .from('content_item_posts')
    .select('posted_at, performance_score')
    .eq('workspace_id', user.id)
    .eq('status', 'posted')
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(100);

  if (!posts || posts.length < 5) {
    return NextResponse.json({
      ok: true,
      data: {
        best_hour: 17,
        best_day: 'Wednesday',
        best_time: '5:00 PM',
        confidence: 'low',
        message: 'Not enough data yet. Post more to unlock scheduling insights.',
      },
      correlation_id: correlationId,
    });
  }

  // Analyze by hour
  const hourScores: Record<number, { total: number; count: number }> = {};
  const dayScores: Record<number, { total: number; count: number }> = {};

  for (const p of posts) {
    const dt = new Date((p as any).posted_at);
    const hour = dt.getHours();
    const day = dt.getDay();
    const score = (p as any).performance_score || 0;

    if (!hourScores[hour]) hourScores[hour] = { total: 0, count: 0 };
    hourScores[hour].total += score;
    hourScores[hour].count++;

    if (!dayScores[day]) dayScores[day] = { total: 0, count: 0 };
    dayScores[day].total += score;
    dayScores[day].count++;
  }

  const bestHourEntry = Object.entries(hourScores)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0];

  const bestDayEntry = Object.entries(dayScores)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0];

  const bestHour = bestHourEntry ? parseInt(bestHourEntry[0]) : 17;
  const bestDay = bestDayEntry ? parseInt(bestDayEntry[0]) : 3;
  const ampm = bestHour >= 12 ? 'PM' : 'AM';
  const h12 = bestHour === 0 ? 12 : bestHour > 12 ? bestHour - 12 : bestHour;

  const response = NextResponse.json({
    ok: true,
    data: {
      best_hour: bestHour,
      best_day: DAY_NAMES[bestDay],
      best_time: `${h12}:00 ${ampm}`,
      confidence: posts.length >= 20 ? 'high' : 'medium',
      message: `Your best posting window is ${DAY_NAMES[bestDay]}s around ${h12}:00 ${ampm}.`,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=3600');
  return response;
}, { routeName: '/api/ai/schedule-suggest', feature: 'smart-scheduling' });

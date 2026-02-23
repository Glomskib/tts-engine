import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyComment, summarizeSentiments, type SentimentResult } from '@/lib/comment-sentiment';
import * as tiktokResearch from '@/lib/tiktok-research';

export const runtime = 'nodejs';

/**
 * GET /api/videos/[id]/comments
 * Returns comments for a tiktok_videos row.
 *
 * [id] = tiktok_videos UUID
 * Query params:
 *   refresh=true — bypass 24h cache and re-fetch from TikTok
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { id: videoUuid } = await params;

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  try {
    // Look up tiktok_videos row
    const { data: video, error: videoErr } = await supabaseAdmin
      .from('tiktok_videos')
      .select('id, tiktok_video_id, comment_count, comments_fetched_at, comment_sentiment_summary')
      .eq('id', videoUuid)
      .eq('user_id', userId)
      .single();

    if (videoErr || !video) {
      return createApiErrorResponse('NOT_FOUND', 'Video not found', 404, correlationId);
    }

    const nativeTikTokId = video.tiktok_video_id;
    const cacheAge = video.comments_fetched_at
      ? Date.now() - new Date(video.comments_fetched_at).getTime()
      : Infinity;
    const cacheValid = cacheAge < 24 * 60 * 60 * 1000; // 24 hours

    // Return cached if valid and not refreshing
    if (cacheValid && !refresh) {
      const { data: cached } = await supabaseAdmin
        .from('tiktok_comments')
        .select('id, text, like_count, reply_count, sentiment, sentiment_score, topics, create_time')
        .eq('user_id', userId)
        .eq('tiktok_video_id', nativeTikTokId)
        .order('like_count', { ascending: false });

      const comments = cached || [];
      const summary = video.comment_sentiment_summary || buildSummaryFromRows(comments);

      const response = NextResponse.json({
        ok: true,
        data: {
          comments,
          totals: summary,
          top_topics: summary.top_topics || [],
          source: 'cache',
        },
        correlation_id: correlationId,
      });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }

    // If Research API is not configured → count-only mode
    if (!tiktokResearch.isConfigured()) {
      const response = NextResponse.json({
        ok: true,
        data: {
          comments: [],
          totals: { total: Number(video.comment_count) || 0, positive: 0, negative: 0, neutral: 0, questions: 0 },
          top_topics: [],
          source: 'count_only',
        },
        correlation_id: correlationId,
      });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }

    // Fetch from TikTok Research API
    const rawComments = await tiktokResearch.fetchAllComments(nativeTikTokId);

    // Classify and upsert
    const sentimentResults: SentimentResult[] = [];
    for (const c of rawComments) {
      const sr = classifyComment(c.text);
      sentimentResults.push(sr);

      await supabaseAdmin
        .from('tiktok_comments')
        .upsert({
          user_id: userId,
          tiktok_video_id: nativeTikTokId,
          tiktok_comment_id: c.id,
          parent_comment_id: c.parent_comment_id || null,
          text: c.text,
          like_count: c.like_count,
          reply_count: c.reply_count,
          create_time: c.create_time,
          sentiment: sr.sentiment,
          sentiment_score: sr.score,
          topics: sr.topics,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,tiktok_comment_id',
          ignoreDuplicates: false,
        });
    }

    const summary = summarizeSentiments(sentimentResults);

    // Update tiktok_videos cache columns
    await supabaseAdmin
      .from('tiktok_videos')
      .update({
        comments_fetched_at: new Date().toISOString(),
        comment_sentiment_summary: summary,
      })
      .eq('id', videoUuid);

    // Read back the stored comments for response
    const { data: storedComments } = await supabaseAdmin
      .from('tiktok_comments')
      .select('id, text, like_count, reply_count, sentiment, sentiment_score, topics, create_time')
      .eq('user_id', userId)
      .eq('tiktok_video_id', nativeTikTokId)
      .order('like_count', { ascending: false });

    const response = NextResponse.json({
      ok: true,
      data: {
        comments: storedComments || [],
        totals: summary,
        top_topics: summary.top_topics,
        source: 'api',
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;

  } catch (err: any) {
    console.error(`[${correlationId}] /api/videos/${videoUuid}/comments error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch comments', 500, correlationId);
  }
}

function buildSummaryFromRows(rows: Array<{ sentiment?: string | null }>) {
  const counts = { total: rows.length, positive: 0, negative: 0, neutral: 0, questions: 0, top_topics: [] as string[] };
  for (const r of rows) {
    if (r.sentiment === 'positive') counts.positive++;
    else if (r.sentiment === 'negative') counts.negative++;
    else if (r.sentiment === 'question') counts.questions++;
    else counts.neutral++;
  }
  return counts;
}

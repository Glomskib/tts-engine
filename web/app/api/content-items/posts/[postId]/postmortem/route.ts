/**
 * API: AI Postmortem for a Post
 *
 * GET  /api/content-items/posts/[postId]/postmortem — get existing postmortem
 * POST /api/content-items/posts/[postId]/postmortem — generate new postmortem
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generatePostmortem } from '@/lib/ai/postmortem/generatePostmortem';
import { evaluateWinner } from '@/lib/content-intelligence/winnerDetector';
import { extractHookPattern } from '@/lib/content-intelligence/hookExtractor';
import { createNotification } from '@/lib/notifications/notify';

export const runtime = 'nodejs';

// ── GET /api/content-items/posts/[postId]/postmortem ──────

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { postId } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify post ownership
  const { data: post } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, workspace_id')
    .eq('id', postId)
    .eq('workspace_id', user.id)
    .single();

  if (!post) {
    return createApiErrorResponse('NOT_FOUND', 'Post not found', 404, correlationId);
  }

  // Get latest postmortem insight for this post
  const { data: insight, error } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('*')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', user.id)
    .eq('insight_type', 'postmortem')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch postmortem', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: insight || null,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/posts/[postId]/postmortem', feature: 'content-intel' });

// ── POST /api/content-items/posts/[postId]/postmortem ─────

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { postId } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Load post with content item join
  const { data: post } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, workspace_id, content_item_id, platform, post_url, caption_used, hashtags_used')
    .eq('id', postId)
    .eq('workspace_id', user.id)
    .single();

  if (!post) {
    return createApiErrorResponse('NOT_FOUND', 'Post not found', 404, correlationId);
  }

  // Get latest metrics for this post
  const { data: metricsRow } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('views, likes, comments, shares, saves, avg_watch_time_seconds, completion_rate')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', user.id)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!metricsRow) {
    return createApiErrorResponse('PRECONDITION_FAILED', 'No metrics available — add metrics before generating a postmortem', 400, correlationId);
  }

  // Load content item for transcript + editor notes
  const { data: contentItem } = await supabaseAdmin
    .from('content_items')
    .select('transcript_text, editor_notes_text, editor_notes_json')
    .eq('id', post.content_item_id)
    .eq('workspace_id', user.id)
    .single();

  // Load latest brief summary (optional)
  const { data: briefRow } = await supabaseAdmin
    .from('creator_briefs')
    .select('data')
    .eq('content_item_id', post.content_item_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  let briefSummary: string | null = null;
  if (briefRow?.data) {
    const d = briefRow.data as Record<string, unknown>;
    // Extract key brief fields for context
    const parts: string[] = [];
    if (d.hook) parts.push(`Hook: ${d.hook}`);
    if (d.concept) parts.push(`Concept: ${d.concept}`);
    if (d.cta) parts.push(`CTA: ${d.cta}`);
    if (d.persona) parts.push(`Persona: ${d.persona}`);
    if (parts.length > 0) briefSummary = parts.join('\n');
  }

  // Generate postmortem via Claude
  const result = await generatePostmortem({
    platform: post.platform,
    postUrl: post.post_url,
    metrics: {
      views: metricsRow.views,
      likes: metricsRow.likes,
      comments: metricsRow.comments,
      shares: metricsRow.shares,
      saves: metricsRow.saves,
      avg_watch_time_seconds: metricsRow.avg_watch_time_seconds,
      completion_rate: metricsRow.completion_rate,
    },
    briefSummary,
    transcript: contentItem?.transcript_text ?? null,
    editorNotesSummary: contentItem?.editor_notes_text ?? null,
    captionUsed: post.caption_used,
    hashtagsUsed: post.hashtags_used,
    correlationId,
  });

  // Store in content_item_ai_insights
  const { data: insight, error } = await supabaseAdmin
    .from('content_item_ai_insights')
    .insert({
      workspace_id: user.id,
      content_item_id: post.content_item_id,
      content_item_post_id: postId,
      insight_type: 'postmortem',
      json: result.json,
      markdown: result.markdown,
    })
    .select('*')
    .single();

  if (error) {
    console.error(`[${correlationId}] ai_insights insert error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to save postmortem', 500, correlationId);
  }

  // Auto-evaluate for winner bank when postmortem flags winner_candidate
  if (result.json.winner_candidate) {
    evaluateWinner(postId, user.id).catch(e =>
      console.error(`[${correlationId}] winner evaluation error:`, e),
    );

    createNotification({
      workspaceId: user.id,
      type: 'viral_alert',
      title: 'Viral Content Detected',
      message: `AI postmortem flagged a post as a potential winner.`,
      link: `/admin/pipeline?video=${post.content_item_id}`,
    }).catch(() => {});
  }

  // Extract hook pattern if hook_strength >= 7
  extractHookPattern(postId, user.id, result.json).catch(e =>
    console.error(`[${correlationId}] hook extraction error:`, e),
  );

  const response = NextResponse.json({
    ok: true,
    data: insight,
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/posts/[postId]/postmortem', feature: 'content-intel' });

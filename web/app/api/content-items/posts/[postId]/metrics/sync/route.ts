/**
 * API: Metrics Sync
 *
 * POST /api/content-items/posts/[postId]/metrics/sync — Sync metrics from platform provider
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { getProvider } from '@/lib/metrics/providers';
import { ProviderNotConfiguredError } from '@/lib/metrics/providers/types';

export const runtime = 'nodejs';

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

  // Load post
  const { data: post, error: postErr } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, platform, post_url, platform_post_id, workspace_id')
    .eq('id', postId)
    .eq('workspace_id', user.id)
    .single();

  if (postErr || !post) {
    return createApiErrorResponse('NOT_FOUND', 'Post not found', 404, correlationId);
  }

  const provider = getProvider(post.platform);

  try {
    const snapshot = await provider.fetchLatest(post.post_url, post.platform_post_id);

    // Insert metrics snapshot
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('content_item_metrics_snapshots')
      .insert({
        workspace_id: user.id,
        content_item_post_id: postId,
        views: snapshot.views ?? null,
        likes: snapshot.likes ?? null,
        comments: snapshot.comments ?? null,
        shares: snapshot.shares ?? null,
        saves: snapshot.saves ?? null,
        avg_watch_time_seconds: snapshot.avg_watch_time_seconds ?? null,
        completion_rate: snapshot.completion_rate ?? null,
        raw_json: snapshot.raw_json ?? null,
        source: 'platform_api',
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error(`[${correlationId}] metrics insert error:`, insertErr);
      return createApiErrorResponse('DB_ERROR', 'Failed to save metrics', 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: inserted,
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      const response = NextResponse.json({
        ok: false,
        code: 'PROVIDER_NOT_CONFIGURED',
        message: err.message,
        correlation_id: correlationId,
      });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }
    throw err;
  }
}, { routeName: '/api/content-items/posts/[postId]/metrics/sync', feature: 'metrics' });

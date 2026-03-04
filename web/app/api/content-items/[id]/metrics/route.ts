/**
 * API: Content Item Metrics Snapshots
 *
 * GET  /api/content-items/[id]/metrics — latest snapshot per post
 * POST /api/content-items/[id]/metrics — add a manual metrics snapshot
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { z } from 'zod';

export const runtime = 'nodejs';

// ── GET /api/content-items/[id]/metrics ───────────────────────

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify content item ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Get all posts for this content item
  const { data: posts } = await supabaseAdmin
    .from('content_item_posts')
    .select('id')
    .eq('content_item_id', id)
    .eq('workspace_id', user.id);

  if (!posts || posts.length === 0) {
    const response = NextResponse.json({
      ok: true,
      data: [],
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  const postIds = posts.map(p => p.id);

  // Get latest snapshot per post using DISTINCT ON equivalent
  // Supabase doesn't support DISTINCT ON directly, so we fetch ordered and dedupe
  const { data: snapshots, error } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .select('*')
    .in('content_item_post_id', postIds)
    .eq('workspace_id', user.id)
    .order('captured_at', { ascending: false });

  if (error) {
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch metrics', 500, correlationId);
  }

  // Dedupe: keep only latest snapshot per post
  const seen = new Set<string>();
  const latest = (snapshots || []).filter(s => {
    if (seen.has(s.content_item_post_id)) return false;
    seen.add(s.content_item_post_id);
    return true;
  });

  const response = NextResponse.json({
    ok: true,
    data: latest,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/metrics', feature: 'content-intel' });

// ── POST /api/content-items/[id]/metrics ──────────────────────

const CreateMetricsSchema = z.object({
  content_item_post_id: z.string().uuid(),
  views: z.number().int().min(0).nullable().optional(),
  likes: z.number().int().min(0).nullable().optional(),
  comments: z.number().int().min(0).nullable().optional(),
  shares: z.number().int().min(0).nullable().optional(),
  saves: z.number().int().min(0).nullable().optional(),
  avg_watch_time_seconds: z.number().int().min(0).nullable().optional(),
  completion_rate: z.number().min(0).max(100).nullable().optional(),
}).strict();

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = CreateMetricsSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  // Verify the post belongs to this content item and workspace
  const { data: post } = await supabaseAdmin
    .from('content_item_posts')
    .select('id')
    .eq('id', parsed.data.content_item_post_id)
    .eq('content_item_id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!post) {
    return createApiErrorResponse('NOT_FOUND', 'Post not found for this content item', 404, correlationId);
  }

  const { data: snapshot, error } = await supabaseAdmin
    .from('content_item_metrics_snapshots')
    .insert({
      workspace_id: user.id,
      content_item_post_id: parsed.data.content_item_post_id,
      views: parsed.data.views ?? null,
      likes: parsed.data.likes ?? null,
      comments: parsed.data.comments ?? null,
      shares: parsed.data.shares ?? null,
      saves: parsed.data.saves ?? null,
      avg_watch_time_seconds: parsed.data.avg_watch_time_seconds ?? null,
      completion_rate: parsed.data.completion_rate ?? null,
      source: 'manual',
    })
    .select('*')
    .single();

  if (error) {
    console.error(`[${correlationId}] metrics_snapshots insert error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to save metrics', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: snapshot,
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/metrics', feature: 'content-intel' });

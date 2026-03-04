/**
 * API: Content Item Posts
 *
 * GET  /api/content-items/[id]/posts — list posts for a content item
 * POST /api/content-items/[id]/posts — create a post record
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { z } from 'zod';
import { POST_PLATFORMS } from '@/lib/content-items/types';
import { inferPlatform, isValidPostUrl } from '@/lib/content-items/platform-inference';

export const runtime = 'nodejs';

// ── GET /api/content-items/[id]/posts ─────────────────────────

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

  const { data: posts, error } = await supabaseAdmin
    .from('content_item_posts')
    .select('*')
    .eq('content_item_id', id)
    .eq('workspace_id', user.id)
    .order('posted_at', { ascending: false, nullsFirst: false });

  if (error) {
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch posts', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: posts || [],
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/posts', feature: 'content-intel' });

// ── POST /api/content-items/[id]/posts ────────────────────────

const CreatePostSchema = z.object({
  post_url: z.string().min(1),
  platform: z.enum(POST_PLATFORMS as [string, ...string[]]).optional(),
  product_id: z.string().uuid().nullable().optional(),
  posted_at: z.string().nullable().optional(),
  caption_used: z.string().nullable().optional(),
  hashtags_used: z.string().nullable().optional(),
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

  const parsed = CreatePostSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  // Validate URL
  if (!isValidPostUrl(parsed.data.post_url)) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid post URL — must be a valid http(s) URL', 400, correlationId);
  }

  // Verify content item ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, product_id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Enforce product linkage
  if (!item.product_id) {
    return createApiErrorResponse('MISSING_PRODUCT_ID', 'Link a product to create a post', 400, correlationId);
  }

  // Infer platform from URL if not provided
  const platform = parsed.data.platform || inferPlatform(parsed.data.post_url);

  const { data: post, error } = await supabaseAdmin
    .from('content_item_posts')
    .insert({
      workspace_id: user.id,
      content_item_id: id,
      platform,
      post_url: parsed.data.post_url,
      product_id: parsed.data.product_id ?? null,
      caption_used: parsed.data.caption_used ?? null,
      hashtags_used: parsed.data.hashtags_used ?? null,
      posted_at: parsed.data.posted_at ?? new Date().toISOString(),
      status: 'posted',
      metrics_source: 'manual',
    })
    .select('*')
    .single();

  if (error) {
    console.error(`[${correlationId}] content_item_posts insert error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to create post', 500, correlationId);
  }

  // Update content item status to 'posted' if not already
  await supabaseAdmin
    .from('content_items')
    .update({ status: 'posted' })
    .eq('id', id)
    .neq('status', 'posted');

  const response = NextResponse.json({
    ok: true,
    data: post,
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/posts', feature: 'content-intel' });

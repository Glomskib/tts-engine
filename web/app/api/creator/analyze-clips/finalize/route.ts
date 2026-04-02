/**
 * POST /api/creator/analyze-clips/finalize
 *
 * Saves the result of an analyze-clips job as a ready_to_post content_item.
 * Called after the creator reviews and optionally edits the AI output.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const userId = authCtx.user.id;

  let body: {
    title?: string;
    hook?: string;
    caption?: string;
    hashtags?: string[];
    cta?: string;
    cover_text?: string;
    final_video_url?: string;
    product_id?: string;
    tiktok_product_id?: string;
    job_id?: string;
    source_clip_urls?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  // Build a unique short_id
  const shortId = `CS-${Date.now().toString(36).toUpperCase()}`;

  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .insert({
      workspace_id: userId,
      product_id: body.product_id || null,
      title: body.title || body.hook || 'Clip Studio Post',
      status: 'ready_to_post',
      short_id: shortId,
      primary_hook: body.hook || null,
      script_text: [body.hook, body.caption, body.cta].filter(Boolean).join('\n\n'),
      caption: body.caption || null,
      hashtags: body.hashtags || [],
      final_video_url: body.final_video_url || null,
      source_type: 'clip_studio',
      source_ref_id: body.job_id || null,
      created_by: userId,
    })
    .select('id, short_id, title, status')
    .single();

  if (error || !item) {
    return createApiErrorResponse('DB_ERROR', error?.message || 'Failed to create content item', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { content_item_id: item.id, short_id: item.short_id, title: item.title },
    correlation_id: correlationId,
  });
}

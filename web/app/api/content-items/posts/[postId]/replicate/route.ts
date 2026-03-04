/**
 * API: Replication Engine
 *
 * POST /api/content-items/posts/[postId]/replicate — generate 5 content variations
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateVariations } from '@/lib/ai/replicate/generateVariations';

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
  const { data: post } = await supabaseAdmin
    .from('content_item_posts')
    .select('id, workspace_id, content_item_id, platform, caption_used, product_id')
    .eq('id', postId)
    .eq('workspace_id', user.id)
    .single();

  if (!post) {
    return createApiErrorResponse('NOT_FOUND', 'Post not found', 404, correlationId);
  }

  // Load latest postmortem for context
  const { data: postmortemInsight } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('json')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', user.id)
    .eq('insight_type', 'postmortem')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const postmortemJson = postmortemInsight?.json as Record<string, unknown> | null;

  // Load hook pattern if available
  const { data: hookRow } = await supabaseAdmin
    .from('hook_patterns')
    .select('pattern')
    .eq('source_post_id', postId)
    .eq('workspace_id', user.id)
    .limit(1)
    .maybeSingle();

  // Load product name if applicable
  let productName: string | null = null;
  if (post.product_id) {
    const { data: prod } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', post.product_id)
      .maybeSingle();
    productName = prod?.name ?? null;
  }

  // Load content item for transcript
  const { data: contentItem } = await supabaseAdmin
    .from('content_items')
    .select('transcript_text')
    .eq('id', post.content_item_id)
    .eq('workspace_id', user.id)
    .single();

  const result = await generateVariations({
    platform: post.platform,
    captionUsed: post.caption_used,
    hookPattern: hookRow?.pattern ?? null,
    productName,
    postmortemSummary: postmortemJson?.summary ? String(postmortemJson.summary) : null,
    whatWorked: Array.isArray(postmortemJson?.what_worked)
      ? (postmortemJson.what_worked as string[])
      : [],
    transcript: contentItem?.transcript_text ?? null,
    correlationId,
  });

  // Store as an AI insight for future reference
  await supabaseAdmin
    .from('content_item_ai_insights')
    .insert({
      workspace_id: user.id,
      content_item_id: post.content_item_id,
      content_item_post_id: postId,
      insight_type: 'variations',
      json: result,
      markdown: result.variations.map((v, i) =>
        `### ${i + 1}. ${v.title}\n**Hook:** ${v.hook}\n\n${v.concept}\n\n**Angle:** ${v.angle}\n\n**Why it works:** ${v.why_it_works}`
      ).join('\n\n---\n\n'),
    });

  const response = NextResponse.json({
    ok: true,
    data: result,
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/posts/[postId]/replicate', feature: 'content-intel' });

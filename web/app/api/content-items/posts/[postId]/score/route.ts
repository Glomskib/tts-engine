/**
 * API: Content Score for a Post
 *
 * GET /api/content-items/posts/[postId]/score — calculate and return score
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { scoreAndPersist } from '@/lib/content-intelligence/contentScore';

export const runtime = 'nodejs';

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
    .select('id, workspace_id, performance_score')
    .eq('id', postId)
    .eq('workspace_id', user.id)
    .single();

  if (!post) {
    return createApiErrorResponse('NOT_FOUND', 'Post not found', 404, correlationId);
  }

  // Calculate fresh score
  const result = await scoreAndPersist(postId, user.id);

  const response = NextResponse.json({
    ok: true,
    data: result,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/posts/[postId]/score', feature: 'content-intel' });

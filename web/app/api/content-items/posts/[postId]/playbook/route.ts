/**
 * API: Viral Playbook for a Post
 *
 * GET /api/content-items/posts/[postId]/playbook — get existing viral playbook
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

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

  const { data: insight, error } = await supabaseAdmin
    .from('content_item_ai_insights')
    .select('*')
    .eq('content_item_post_id', postId)
    .eq('workspace_id', user.id)
    .eq('insight_type', 'viral_playbook')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch playbook', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: insight || null,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/posts/[postId]/playbook', feature: 'content-intel' });

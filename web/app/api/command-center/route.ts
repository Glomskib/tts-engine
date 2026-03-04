/**
 * API: Command Center
 *
 * GET /api/command-center — content queues and intelligence for the command center dashboard
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  const [
    recordQueueResult,
    editingQueueResult,
    postingQueueResult,
    viralResult,
    winnersResult,
    hooksResult,
    productPerfResult,
  ] = await Promise.all([
    // 1. Record Queue
    supabaseAdmin
      .from('content_items')
      .select('id, title, product_id, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_record')
      .order('created_at', { ascending: true })
      .limit(10),

    // 2. Editing Queue
    supabaseAdmin
      .from('content_items')
      .select('id, title, product_id, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'editing')
      .order('created_at', { ascending: true })
      .limit(10),

    // 3. Posting Queue
    supabaseAdmin
      .from('content_items')
      .select('id, title, product_id, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_post')
      .order('created_at', { ascending: true })
      .limit(10),

    // 4. Viral Content (winner candidates from AI postmortems)
    supabaseAdmin
      .from('content_item_ai_insights')
      .select('id, content_item_id, content_item_post_id, generated_at, json, markdown')
      .eq('workspace_id', workspaceId)
      .eq('insight_type', 'winner_candidate')
      .order('generated_at', { ascending: false })
      .limit(5),

    // 5. Recent Winners
    supabaseAdmin
      .from('winners_bank')
      .select('id, hook, full_script, video_url, view_count, engagement_rate, performance_score, created_at')
      .eq('user_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5),

    // 6. Top Hooks
    supabaseAdmin
      .from('hook_patterns')
      .select('id, pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', workspaceId)
      .order('performance_score', { ascending: false })
      .limit(10),

    // 7. Product Performance (top 5 by engagement)
    supabaseAdmin
      .from('product_performance')
      .select('product_id, total_posts, avg_views, avg_engagement, products(name)')
      .eq('workspace_id', workspaceId)
      .order('avg_engagement', { ascending: false })
      .limit(5),
  ]);

  const response = NextResponse.json({
    ok: true,
    data: {
      record_queue: recordQueueResult.data || [],
      editing_queue: editingQueueResult.data || [],
      posting_queue: postingQueueResult.data || [],
      viral_content: viralResult.data || [],
      recent_winners: winnersResult.data || [],
      top_hooks: hooksResult.data || [],
      product_performance: productPerfResult.data || [],
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/command-center', feature: 'command-center' });

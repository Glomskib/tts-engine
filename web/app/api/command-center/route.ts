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
    experimentsResult,
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

    // 8. Active experiments (distinct variable_type + variant combos)
    supabaseAdmin
      .from('content_experiments')
      .select('variable_type, variant, content_item_id')
      .eq('workspace_id', workspaceId),
  ]);

  // Compute experiment summary: count per (variable_type, variant)
  const experimentRows = experimentsResult.data || [];
  const expMap = new Map<string, { variable_type: string; variant: string; count: number }>();
  for (const row of experimentRows) {
    const key = `${row.variable_type}::${row.variant}`;
    const entry = expMap.get(key);
    if (entry) {
      entry.count++;
    } else {
      expMap.set(key, { variable_type: row.variable_type, variant: row.variant, count: 1 });
    }
  }
  const experimentSummary = Array.from(expMap.values()).sort((a, b) => b.count - a.count);

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
      experiments: experimentSummary,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/command-center', feature: 'command-center' });

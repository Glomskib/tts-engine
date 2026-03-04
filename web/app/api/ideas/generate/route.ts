/**
 * API: AI Idea Generator
 *
 * POST /api/ideas/generate — generate 10 video ideas from workspace intelligence
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateIdeas } from '@/lib/ai/ideas/generateIdeas';
import { fetchTopHookPatterns } from '@/lib/content-intelligence/hookExtractor';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  // Parallel data fetch
  const [
    hookPatterns,
    winnersResult,
    postmortemsResult,
    brandsResult,
    productsResult,
  ] = await Promise.all([
    fetchTopHookPatterns(workspaceId, 10),

    supabaseAdmin
      .from('winners_bank')
      .select('hook, performance_score, view_count')
      .eq('user_id', workspaceId)
      .order('performance_score', { ascending: false })
      .limit(10),

    supabaseAdmin
      .from('content_item_ai_insights')
      .select('json')
      .eq('workspace_id', workspaceId)
      .eq('insight_type', 'postmortem')
      .order('generated_at', { ascending: false })
      .limit(5),

    supabaseAdmin
      .from('brands')
      .select('name, target_audience')
      .eq('user_id', workspaceId)
      .eq('is_active', true),

    supabaseAdmin
      .from('products')
      .select('name, category')
      .eq('user_id', workspaceId),
  ]);

  // Extract postmortem summaries
  const postmortems = (postmortemsResult.data || [])
    .filter(p => p.json)
    .map(p => {
      const j = p.json as Record<string, unknown>;
      return {
        summary: String(j.summary || ''),
        what_worked: Array.isArray(j.what_worked) ? j.what_worked.map(String) : [],
        hook_pattern: j.hook_analysis
          ? String((j.hook_analysis as Record<string, unknown>).pattern_detected || '')
          : null,
      };
    });

  const ideas = await generateIdeas({
    hookPatterns,
    winners: winnersResult.data || [],
    postmortems,
    brands: brandsResult.data || [],
    products: productsResult.data || [],
    correlationId,
  });

  const response = NextResponse.json({
    ok: true,
    data: { ideas },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/ideas/generate', feature: 'idea-generation' });

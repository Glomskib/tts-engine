/**
 * API: Experiment Generator
 *
 * POST /api/intelligence/experiments — generate hook variations from winning hooks
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { generateExperiments } from '@/lib/ai/experiments/generateExperiments';

export const runtime = 'nodejs';

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Get top hooks to generate variations for
  const { data: topHooks } = await supabaseAdmin
    .from('hook_patterns')
    .select('example_hook, pattern, performance_score')
    .eq('workspace_id', user.id)
    .gt('performance_score', 0)
    .order('performance_score', { ascending: false })
    .limit(5);

  const hooks = (topHooks || []).map((h: any) => h.example_hook || h.pattern);

  if (hooks.length === 0) {
    return NextResponse.json({
      ok: true,
      data: [],
      message: 'No hooks with performance data yet',
      correlation_id: correlationId,
    });
  }

  const variations = await generateExperiments(hooks, correlationId);

  const response = NextResponse.json({
    ok: true,
    data: variations,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/intelligence/experiments', feature: 'experiment-generator' });

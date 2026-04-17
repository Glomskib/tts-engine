/**
 * POST /api/video-engine/iterate
 *
 * Placeholder iteration intake for the result-page "Quick changes" row.
 * The real iteration pipeline (shorter / stronger_hook / change_tone / generate_3_more)
 * is still being built — this route accepts the request, validates ownership,
 * logs intent, and returns { ok: true, queued: false } so the client can show
 * a "coming soon" banner without needing a separate flag.
 *
 * Body: { run_id: string; clip_id: string; type: IterationType }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const ALLOWED_TYPES = ['shorter', 'stronger_hook', 'aggressive', 'generate_3_more'] as const;
type IterationType = (typeof ALLOWED_TYPES)[number];

interface Body {
  run_id?: string;
  clip_id?: string;
  type?: IterationType;
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: Body = {};
  try { body = (await request.json()) as Body; }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const { run_id, clip_id, type } = body;
  if (!run_id || !clip_id || !type) {
    return createApiErrorResponse('BAD_REQUEST', 'run_id, clip_id, and type are required', 400, correlationId);
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return createApiErrorResponse('BAD_REQUEST', `type must be one of: ${ALLOWED_TYPES.join(', ')}`, 400, correlationId);
  }

  // Ownership check — the run's user_id must match the auth user.
  const { data: run, error: runErr } = await supabaseAdmin
    .from('ve_runs')
    .select('id, user_id')
    .eq('id', run_id)
    .maybeSingle();
  if (runErr || !run) {
    return createApiErrorResponse('NOT_FOUND', 'Run not found', 404, correlationId);
  }
  if (!auth.isAdmin && run.user_id !== auth.user.id) {
    return createApiErrorResponse('FORBIDDEN', 'Not your run', 403, correlationId);
  }

  console.log('[video-engine/iterate] REQUEST', {
    user_id: auth.user.id,
    run_id,
    clip_id,
    type,
    correlation_id: correlationId,
  });

  // Not wired to the iteration pipeline yet — return an acknowledgement so the
  // client can surface a "coming soon" message without a separate feature flag.
  return NextResponse.json({
    ok: true,
    data: {
      queued: false,
      type,
      message: 'Iteration launching this week.',
    },
    correlation_id: correlationId,
  });
}

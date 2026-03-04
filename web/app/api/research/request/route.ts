/**
 * POST /api/research/request
 *
 * Enqueues an external research job via the canonical dispatch pipeline.
 * Does not perform any web calls directly — all research runs through
 * agent-dispatch and persists results in ff_research_jobs.
 *
 * Auth: AGENT_DISPATCH_SECRET bearer token.
 * Feature gate: external_research (requires OpenClaw enabled).
 */
import { NextResponse } from 'next/server';
import { dispatch } from '@/lib/flashflow/agent-dispatch';
import type { RunSource } from '@/lib/ops/run-source';

export async function POST(request: Request) {
  // 1. Auth: AGENT_DISPATCH_SECRET bearer token
  const auth = request.headers.get('authorization');
  const secret = process.env.AGENT_DISPATCH_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { query, targets, mode, idempotency_key, requested_by, run_source } = body;

  if (typeof query !== 'string' || !query) {
    return NextResponse.json({ error: 'query (string) is required' }, { status: 400 });
  }
  if (typeof idempotency_key !== 'string' || !idempotency_key) {
    return NextResponse.json({ error: 'idempotency_key (string) is required' }, { status: 400 });
  }

  // 4. Dispatch via canonical pipeline
  const result = await dispatch({
    job_type: 'external_research',
    idempotency_key,
    payload: {
      query,
      targets: targets || [],
      mode: mode || 'web_fetch',
    },
    requested_by: (requested_by as string) || 'user',
    run_source: (run_source as RunSource) || 'openclaw',
  });

  // 5. Return structured response
  const httpStatus = result.status === 'error' && !result.idempotent_hit ? 500 : 200;
  return NextResponse.json(
    {
      queued: result.status !== 'error',
      run_id: result.run_id,
      dispatch_status: result.status,
      summary: result.summary,
      error: result.error,
      idempotent_hit: result.idempotent_hit,
    },
    { status: httpStatus },
  );
}

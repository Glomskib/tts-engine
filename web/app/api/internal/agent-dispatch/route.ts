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

  // 2. Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { job_type, idempotency_key, payload, requested_by, run_source } = body;

  if (typeof job_type !== 'string' || !job_type) {
    return NextResponse.json({ error: 'job_type (string) is required' }, { status: 400 });
  }
  if (typeof idempotency_key !== 'string' || !idempotency_key) {
    return NextResponse.json({ error: 'idempotency_key (string) is required' }, { status: 400 });
  }

  // 3. Dispatch
  const result = await dispatch({
    job_type,
    idempotency_key,
    payload: (payload as Record<string, unknown>) || {},
    requested_by: (requested_by as string) || undefined,
    run_source: (run_source as RunSource) || 'openclaw',
  });

  // 4. Return structured JSON
  const httpStatus = result.status === 'error' && !result.idempotent_hit ? 500 : 200;
  return NextResponse.json(result, { status: httpStatus });
}

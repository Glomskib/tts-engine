/**
 * POST /api/admin/command-center/agent-runs/finish
 *
 * Finishes an existing agent run. Requires CC_INGEST_KEY or owner auth.
 * Returns 501 if CC_INGEST_KEY is not configured.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { recordAgentRunFinish } from '@/lib/command-center/agent-runs';
import { checkRateLimit } from '@/lib/command-center/rate-limiter';

export const runtime = 'nodejs';

function checkIngestKey(request: Request): boolean {
  const key = process.env.CC_INGEST_KEY;
  if (!key) return false;
  return request.headers.get('x-cc-ingest-key') === key;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = checkRateLimit('agent-runs', ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limited', retry_after_seconds: 60 }, { status: 429 });
  }

  const hasIngestKey = checkIngestKey(request);

  if (!hasIngestKey) {
    if (!process.env.CC_INGEST_KEY) {
      return NextResponse.json(
        { error: 'CC_INGEST_KEY not configured', hint: 'Set CC_INGEST_KEY env var to enable ingestion.' },
        { status: 501 },
      );
    }

    const denied = await requireOwner(request);
    if (denied) return denied;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { run_id, status, tokens_in, tokens_out, cost_usd, model_used, metadata } = body;

  if (!run_id || typeof run_id !== 'string') {
    return NextResponse.json({ error: 'run_id is required' }, { status: 400 });
  }
  if (status !== 'completed' && status !== 'failed') {
    return NextResponse.json({ error: 'status must be "completed" or "failed"' }, { status: 400 });
  }

  await recordAgentRunFinish({
    run_id,
    status,
    tokens_in: typeof tokens_in === 'number' ? tokens_in : undefined,
    tokens_out: typeof tokens_out === 'number' ? tokens_out : undefined,
    cost_usd: typeof cost_usd === 'number' ? cost_usd : undefined,
    model_used: typeof model_used === 'string' ? model_used : undefined,
    metadata: (metadata as Record<string, unknown>) ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

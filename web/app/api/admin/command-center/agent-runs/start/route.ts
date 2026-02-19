/**
 * POST /api/admin/command-center/agent-runs/start
 *
 * Starts a new agent run. Requires CC_INGEST_KEY or owner auth.
 * Returns 501 if CC_INGEST_KEY is not configured.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { recordAgentRunStart } from '@/lib/command-center/agent-runs';
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

  // Allow either CC_INGEST_KEY or owner auth
  const hasIngestKey = checkIngestKey(request);

  if (!hasIngestKey) {
    // Fall back to owner auth
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

  const { agent_id, related_type, related_id, action, model_primary, metadata } = body;

  if (!agent_id || typeof agent_id !== 'string') {
    return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
  }
  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  const run = await recordAgentRunStart({
    agent_id,
    related_type: (related_type as string) ?? null,
    related_id: (related_id as string) ?? null,
    action,
    model_primary: (model_primary as string) ?? null,
    metadata: (metadata as Record<string, unknown>) ?? undefined,
  });

  return NextResponse.json({ ok: true, data: { run_id: run.id } });
}

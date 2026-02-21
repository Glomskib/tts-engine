/**
 * POST /api/finops/openclaw/usage
 *
 * Lightweight ingestion endpoint for OpenClaw to report usage events.
 * Accepts token counts + optional cost; computes cost if missing.
 * Auth: requires FINOPS_INGEST_KEY header or CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logUsageEvent } from '@/lib/finops/log-usage';
import { costFromUsage } from '@/lib/finops/cost';

export async function POST(request: NextRequest) {
  // Auth: simple shared secret
  const authHeader = request.headers.get('authorization');
  const ingestKey = process.env.FINOPS_INGEST_KEY || process.env.CRON_SECRET;

  if (!ingestKey || authHeader !== `Bearer ${ingestKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    lane,
    agent_id,
    provider,
    model,
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_write_tokens,
    cost_usd,
    correlation_id,
    endpoint,
    user_id,
    metadata,
  } = body as Record<string, unknown>;

  if (!lane || typeof lane !== 'string') {
    return NextResponse.json({ error: 'lane is required' }, { status: 400 });
  }
  if (!provider || typeof provider !== 'string') {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 });
  }
  if (!model || typeof model !== 'string') {
    return NextResponse.json({ error: 'model is required' }, { status: 400 });
  }

  const inTokens = typeof input_tokens === 'number' ? input_tokens : 0;
  const outTokens = typeof output_tokens === 'number' ? output_tokens : 0;
  const cacheRead = typeof cache_read_tokens === 'number' ? cache_read_tokens : 0;
  const cacheWrite = typeof cache_write_tokens === 'number' ? cache_write_tokens : 0;

  const computedCost = typeof cost_usd === 'number'
    ? cost_usd
    : costFromUsage({ provider, model, input_tokens: inTokens, output_tokens: outTokens, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite });

  const result = await logUsageEvent({
    source: 'openclaw',
    lane,
    provider,
    model,
    input_tokens: inTokens,
    output_tokens: outTokens,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    cost_usd: computedCost,
    agent_id: typeof agent_id === 'string' ? agent_id : undefined,
    user_id: typeof user_id === 'string' ? user_id : undefined,
    correlation_id: typeof correlation_id === 'string' ? correlation_id : undefined,
    endpoint: typeof endpoint === 'string' ? endpoint : undefined,
    metadata: (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
      ? metadata as Record<string, unknown>
      : undefined,
  });

  if (!result) {
    return NextResponse.json({ error: 'Failed to insert usage event' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.id, cost_usd: computedCost });
}

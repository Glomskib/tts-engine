/**
 * GET /api/finops/top?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Admin-only endpoint returning the top endpoints and models by cost
 * for the given date range. Queries raw ff_usage_events for per-endpoint data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

interface UsageRow {
  endpoint: string | null;
  provider: string;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'start and end query params required (YYYY-MM-DD)',
      400,
      correlationId,
    );
  }

  // Query raw events for endpoint-level data
  const { data: rows, error } = await supabaseAdmin
    .from('ff_usage_events')
    .select('endpoint, provider, model, cost_usd, input_tokens, output_tokens')
    .gte('created_at', `${start}T00:00:00Z`)
    .lt('created_at', `${end}T00:00:00Z` === `${end}T00:00:00Z`
      ? new Date(new Date(end).getTime() + 86400000).toISOString()
      : `${end}T00:00:00Z`);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const allRows = (rows ?? []) as UsageRow[];

  // ── Top endpoints by cost ──
  const endpointMap = new Map<string, { calls: number; cost_usd: number; input_tokens: number; output_tokens: number }>();
  for (const r of allRows) {
    const key = r.endpoint || '(unknown)';
    const e = endpointMap.get(key) ?? { calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
    e.calls += 1;
    e.cost_usd += Number(r.cost_usd);
    e.input_tokens += r.input_tokens;
    e.output_tokens += r.output_tokens;
    endpointMap.set(key, e);
  }

  const topEndpoints = [...endpointMap.entries()]
    .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
    .slice(0, 20)
    .map(([endpoint, data]) => ({ endpoint, ...data }));

  // ── Top models by cost ──
  const modelMap = new Map<string, { calls: number; cost_usd: number; input_tokens: number; output_tokens: number }>();
  for (const r of allRows) {
    const key = `${r.provider}/${r.model}`;
    const e = modelMap.get(key) ?? { calls: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
    e.calls += 1;
    e.cost_usd += Number(r.cost_usd);
    e.input_tokens += r.input_tokens;
    e.output_tokens += r.output_tokens;
    modelMap.set(key, e);
  }

  const topModels = [...modelMap.entries()]
    .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
    .slice(0, 20)
    .map(([model, data]) => ({ model, ...data }));

  return NextResponse.json({
    ok: true,
    period: { start, end },
    total_events: allRows.length,
    top_endpoints: topEndpoints,
    top_models: topModels,
    correlation_id: correlationId,
  });
}

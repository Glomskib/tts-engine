/**
 * GET /api/admin/command-center/research
 *
 * Owner-only endpoint returning research job history from ff_research_jobs
 * plus rate-limit status from research-caps.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkResearchRateLimit } from '@/lib/ops/research-caps';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const ownerCheck = await requireOwner(request);
  if (ownerCheck) return ownerCheck;

  const statusFilter = request.nextUrl.searchParams.get('status');
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 200);

  // Query ff_research_jobs
  let query = supabaseAdmin
    .from('ff_research_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter && ['queued', 'running', 'ok', 'error'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data: jobs, error: jobsErr } = await query;

  if (jobsErr) {
    return NextResponse.json(
      { ok: false, error: `Failed to query research jobs: ${jobsErr.message}` },
      { status: 500 },
    );
  }

  // Rate limit status
  const rateLimit = await checkResearchRateLimit();

  // Status counts (last 24h)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: countRows } = await supabaseAdmin
    .from('ff_research_jobs')
    .select('status')
    .gte('created_at', since24h);

  const statusCounts: Record<string, number> = { queued: 0, running: 0, ok: 0, error: 0 };
  for (const row of countRows ?? []) {
    const s = row.status as string;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    jobs: jobs ?? [],
    rate_limit: rateLimit,
    status_counts: statusCounts,
    fetched_at: new Date().toISOString(),
  });
}

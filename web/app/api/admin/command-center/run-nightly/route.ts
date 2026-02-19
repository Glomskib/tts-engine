/**
 * POST /api/admin/command-center/run-nightly
 *
 * Owner-only manual trigger for the nightly idea research job.
 * Query param ?dry_run=true for dry run mode.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { runNightlyIdeaResearch } from '@/lib/command-center/nightly-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dry_run') === 'true';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const result = await runNightlyIdeaResearch(dryRun, limit);

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      ...result,
    });
  } catch (err) {
    console.error('[run-nightly] error:', err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

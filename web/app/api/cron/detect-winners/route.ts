/**
 * Cron: Detect Winner Patterns
 *
 * Runs every 6 hours. Enqueues detect_winners jobs for each active workspace.
 * The actual work is done by the job runner (process-jobs cron).
 * Protected by CRON_SECRET.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueJob } from '@/lib/jobs';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LOG = '[cron/detect-winners]';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get distinct workspace IDs that have posted content in the last 30 days
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: workspaces, error: wsError } = await supabaseAdmin
    .from('content_item_posts')
    .select('workspace_id')
    .eq('status', 'posted')
    .gte('posted_at', cutoff);

  if (wsError || !workspaces?.length) {
    console.log(`${LOG} No active workspaces found`);
    return NextResponse.json({ ok: true, jobs_enqueued: 0 });
  }

  // Deduplicate workspace IDs
  const uniqueWorkspaceIds = [...new Set(workspaces.map(w => w.workspace_id))];

  let enqueued = 0;
  for (const workspaceId of uniqueWorkspaceIds) {
    const jobId = await enqueueJob(workspaceId, 'detect_winners', { days_back: 30 });
    if (jobId) enqueued++;
  }

  console.log(`${LOG} Enqueued ${enqueued} detect_winners jobs for ${uniqueWorkspaceIds.length} workspaces`);

  return NextResponse.json({
    ok: true,
    workspaces: uniqueWorkspaceIds.length,
    jobs_enqueued: enqueued,
  });
}

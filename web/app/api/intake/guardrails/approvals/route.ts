/**
 * GET/POST /api/intake/guardrails/approvals
 * List and act on jobs needing approval.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const auth = await getApiAuthContext(request);
  if (!auth.user || !auth.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: jobs, error } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id, drive_file_name, status, last_error, estimated_cost_usd, created_at, result')
    .eq('user_id', auth.user.id)
    .eq('status', 'NEEDS_APPROVAL')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobs: jobs || [] });
}, { routeName: '/api/intake/guardrails/approvals', feature: 'drive-intake' });

export const POST = withErrorCapture(async (request: Request) => {
  const auth = await getApiAuthContext(request);
  if (!auth.user || !auth.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { job_id: string; action: 'approve' | 'reject' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.job_id || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'job_id and action (approve|reject) required' }, { status: 400 });
  }

  // Verify job exists and belongs to user
  const { data: job } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id, status, user_id')
    .eq('id', body.job_id)
    .eq('user_id', auth.user.id)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (job.status !== 'NEEDS_APPROVAL') {
    return NextResponse.json({ error: `Job status is ${job.status}, not NEEDS_APPROVAL` }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.action === 'approve') {
    // Set back to PENDING so worker picks it up again
    await supabaseAdmin
      .from('drive_intake_jobs')
      .update({
        status: 'PENDING',
        approval_status: 'approved',
        approved_by: auth.user.id,
        approved_at: now,
        failure_reason: null,
        last_error: null,
        next_attempt_at: null,
        updated_at: now,
      })
      .eq('id', body.job_id);
  } else {
    // Reject → mark as FAILED
    await supabaseAdmin
      .from('drive_intake_jobs')
      .update({
        status: 'FAILED',
        approval_status: 'rejected',
        approved_by: auth.user.id,
        approved_at: now,
        failure_reason: 'REJECTED_BY_USER',
        last_error: 'Rejected by operator',
        finished_at: now,
        updated_at: now,
      })
      .eq('id', body.job_id);

    // Mark event as failed too
    await supabaseAdmin
      .from('drive_intake_events')
      .update({ status: 'FAILED', last_error: 'Rejected by operator', updated_at: now })
      .eq('user_id', auth.user.id)
      .eq('drive_file_id', job.id);
  }

  return NextResponse.json({ ok: true, action: body.action, job_id: body.job_id });
}, { routeName: '/api/intake/guardrails/approvals', feature: 'drive-intake' });

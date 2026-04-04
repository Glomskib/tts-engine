/**
 * POST /api/content-items/[id]/render
 *
 * Enqueue a render job for a content item.
 * Validates preconditions then enqueues via the job queue.
 * The actual FFmpeg render happens asynchronously in the job runner.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { resolveUserId, resolveWorkspaceId, resolveContentItemId } from '@/lib/errors/sentry-resolvers';
import { validateEditPlan } from '@/lib/editing/validate-edit-plan';
import { enqueueJob } from '@/lib/jobs/enqueue';

export const runtime = 'nodejs';

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify ownership and load key fields
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, raw_video_url, raw_video_storage_path, edit_plan_json, edit_status')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (fetchErr || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Check for multi-clip assets
  const { count: clipCount } = await supabaseAdmin
    .from('content_item_assets')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', id)
    .eq('kind', 'raw_clip');

  const hasClips = (clipCount ?? 0) > 0;

  // Pre-flight checks: need either raw video or clips
  if (!hasClips && !item.raw_video_url && !item.raw_video_storage_path) {
    return createApiErrorResponse(
      'PRECONDITION_FAILED',
      'No raw video or clips available. Upload media before rendering.',
      422,
      correlationId,
    );
  }

  if (!item.edit_plan_json) {
    return createApiErrorResponse(
      'PRECONDITION_FAILED',
      'No edit plan available. Generate an edit plan before rendering.',
      422,
      correlationId,
    );
  }

  const validation = validateEditPlan(item.edit_plan_json);
  if (!validation.ok) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `Invalid edit plan: ${validation.errors!.join('; ')}`,
      422,
      correlationId,
      { validation_errors: validation.errors },
    );
  }

  // Guard against double-render: block if already rendering or if a pending/running render job exists
  if (item.edit_status === 'rendering') {
    return createApiErrorResponse(
      'CONFLICT',
      'A render is already in progress for this content item.',
      409,
      correlationId,
    );
  }

  // Check for existing pending/running render job for this content item
  const { data: existingJobs } = await supabaseAdmin
    .from('jobs')
    .select('id, status')
    .eq('type', 'render_video')
    .in('status', ['pending', 'running'])
    .eq('payload->>content_item_id', id)
    .limit(1);

  if (existingJobs && existingJobs.length > 0) {
    return createApiErrorResponse(
      'CONFLICT',
      'A render job is already queued or running for this content item.',
      409,
      correlationId,
      { job_id: existingJobs[0].id },
    );
  }

  // Mark as rendering optimistically so the UI updates immediately
  await supabaseAdmin
    .from('content_items')
    .update({ edit_status: 'rendering', render_error: null })
    .eq('id', id);

  // Enqueue the render job
  const jobId = await enqueueJob(
    item.workspace_id,
    'render_video',
    { content_item_id: id, actor_id: user.id },
    3, // max attempts
  );

  if (!jobId) {
    // Rollback status on enqueue failure
    await supabaseAdmin
      .from('content_items')
      .update({ edit_status: item.edit_status || 'ready_to_render' })
      .eq('id', id);

    return createApiErrorResponse(
      'INTERNAL',
      'Failed to enqueue render job',
      500,
      correlationId,
    );
  }

  const response = NextResponse.json({
    ok: true,
    data: {
      job_id: jobId,
      status: 'queued',
      message: 'Render job enqueued. It will be processed shortly.',
    },
    correlation_id: correlationId,
  }, { status: 202 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, {
  routeName: '/api/content-items/[id]/render',
  feature: 'editing-engine',
  userIdResolver: resolveUserId,
  workspaceIdResolver: resolveWorkspaceId,
  contentItemIdResolver: resolveContentItemId,
});

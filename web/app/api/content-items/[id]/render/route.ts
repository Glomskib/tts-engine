/**
 * POST /api/content-items/[id]/render
 *
 * Trigger the editing engine renderer for a content item.
 * Requires: raw_video_url or raw_video_storage_path + valid edit_plan_json.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { renderContentItem } from '@/lib/editing/render-plan';
import { validateEditPlan } from '@/lib/editing/validate-edit-plan';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute Vercel timeout

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

  // Pre-flight checks
  if (!item.raw_video_url && !item.raw_video_storage_path) {
    return createApiErrorResponse(
      'PRECONDITION_FAILED',
      'No raw video available. Upload a video before rendering.',
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

  // Guard against double-render
  if (item.edit_status === 'rendering') {
    return createApiErrorResponse(
      'CONFLICT',
      'A render is already in progress for this content item.',
      409,
      correlationId,
    );
  }

  // Kick off render
  try {
    const result = await renderContentItem({
      contentItemId: id,
      actorId: user.id,
    });

    const response = NextResponse.json({
      ok: true,
      data: {
        rendered_video_url: result.output_url,
        storage_path: result.storage_path,
        duration_sec: result.duration_sec,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createApiErrorResponse(
      'INTERNAL',
      `Render failed: ${message}`,
      500,
      correlationId,
    );
  }
}, { routeName: '/api/content-items/[id]/render', feature: 'editing-engine' });

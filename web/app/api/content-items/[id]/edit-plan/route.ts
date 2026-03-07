/**
 * POST /api/content-items/[id]/edit-plan
 *
 * Generate an edit plan from content item fields.
 * Reads editing_instructions, editor_notes_json, primary_hook, etc.
 * Stores the plan in edit_plan_json and sets edit_status = ready_to_render.
 *
 * GET /api/content-items/[id]/edit-plan
 * Returns the current edit plan.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { resolveUserId, resolveWorkspaceId, resolveContentItemId } from '@/lib/errors/sentry-resolvers';
import { buildEditPlan } from '@/lib/editing/build-edit-plan';
import { validateEditPlan } from '@/lib/editing/validate-edit-plan';
import { logContentItemEvent } from '@/lib/content-items/sync';

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

  // Load content item with all fields needed for plan generation
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, editing_instructions, editor_notes_json, primary_hook, caption, edit_status, raw_video_url, raw_video_storage_path')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (fetchErr || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Need either raw video or some instructions to build a plan
  if (!item.raw_video_url && !item.raw_video_storage_path) {
    return createApiErrorResponse(
      'PRECONDITION_FAILED',
      'Upload a raw video before generating an edit plan.',
      422,
      correlationId,
    );
  }

  // Parse optional body for overrides
  let overrides: { source_duration_sec?: number; cta_text?: string; brand_handle?: string } = {};
  try {
    const body = await request.json();
    overrides = body || {};
  } catch {
    // No body is fine
  }

  // We need source_duration_sec — either from body or default estimate
  const sourceDuration = overrides.source_duration_sec || 60; // Default; real probe happens at render time

  const { plan, warnings } = buildEditPlan({
    source_duration_sec: sourceDuration,
    editing_instructions: item.editing_instructions,
    editor_notes_json: item.editor_notes_json,
    primary_hook: item.primary_hook,
    caption: item.caption,
    cta_text: overrides.cta_text,
    brand_handle: overrides.brand_handle,
  });

  // Validate the generated plan
  const validation = validateEditPlan(plan);
  if (!validation.ok) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `Generated plan failed validation: ${validation.errors!.join('; ')}`,
      422,
      correlationId,
      { validation_errors: validation.errors, warnings },
    );
  }

  // Store plan and update status
  const prevStatus = item.edit_status;
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('content_items')
    .update({
      edit_plan_json: plan,
      edit_status: 'ready_to_render',
      render_error: null,
    })
    .eq('id', id)
    .select('id, edit_plan_json, edit_status')
    .single();

  if (updateErr) {
    console.error(`[${correlationId}] edit-plan update error:`, updateErr);
    return createApiErrorResponse('DB_ERROR', 'Failed to save edit plan', 500, correlationId);
  }

  await logContentItemEvent(id, 'edit_plan_generated', user.id, prevStatus, 'ready_to_render', {
    action_count: plan.actions.length,
    action_types: [...new Set(plan.actions.map(a => a.type))],
    warnings,
  });

  const response = NextResponse.json({
    ok: true,
    data: {
      ...updated,
      warnings,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, {
  routeName: '/api/content-items/[id]/edit-plan',
  feature: 'editing-engine',
  userIdResolver: resolveUserId,
  workspaceIdResolver: resolveWorkspaceId,
  contentItemIdResolver: resolveContentItemId,
});

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .select('id, edit_plan_json, edit_status, editing_instructions, render_error')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: item,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, {
  routeName: '/api/content-items/[id]/edit-plan',
  feature: 'editing-engine',
  userIdResolver: resolveUserId,
  workspaceIdResolver: resolveWorkspaceId,
  contentItemIdResolver: resolveContentItemId,
});

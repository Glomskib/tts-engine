/**
 * API: Recording Sprint Detail
 *
 * GET   /api/admin/recording-sprints/[id]  — get sprint with items
 * PATCH /api/admin/recording-sprints/[id]  — update sprint (item actions, pause, complete)
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

// ── GET ─────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await context.params;
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);

  // Fetch sprint
  const { data: sprint } = await supabaseAdmin
    .from('recording_sprints')
    .select('*, experiments!experiment_id(name, product_id)')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!sprint) {
    return createApiErrorResponse('NOT_FOUND', 'Sprint not found', 404, correlationId);
  }

  // Fetch sprint items with content item details
  const { data: items } = await supabaseAdmin
    .from('recording_sprint_items')
    .select(`
      id, content_item_id, sort_order, status, recorded_at,
      content_item:content_items!content_item_id(
        id, title, status, primary_hook, script_text, script_json,
        raw_video_url, raw_footage_url, drive_folder_id
      )
    `)
    .eq('sprint_id', id)
    .order('sort_order', { ascending: true });

  // Also fetch experiment creatives for hook/angle/persona metadata
  const { data: creatives } = await supabaseAdmin
    .from('experiment_creatives')
    .select('content_item_id, hook, angle, persona')
    .eq('experiment_id', sprint.experiment_id);

  const creativeMap = new Map<string, { hook: string | null; angle: string | null; persona: string | null }>();
  for (const c of creatives || []) {
    creativeMap.set(c.content_item_id, { hook: c.hook, angle: c.angle, persona: c.persona });
  }

  // Merge creative metadata into items
  const enrichedItems = (items || []).map(item => {
    const creative = creativeMap.get(item.content_item_id);
    return {
      ...item,
      creative_hook: creative?.hook || null,
      creative_angle: creative?.angle || null,
      creative_persona: creative?.persona || null,
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      ...sprint,
      items: enrichedItems,
    },
    correlation_id: correlationId,
  });
}

// ── PATCH ───────────────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = generateCorrelationId();
  const { id } = await context.params;
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { action, item_id, video_url } = body;

  // Verify sprint ownership
  const { data: sprint } = await supabaseAdmin
    .from('recording_sprints')
    .select('id, status, total_items, completed_items, skipped_items, current_index')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!sprint) {
    return createApiErrorResponse('NOT_FOUND', 'Sprint not found', 404, correlationId);
  }

  // ── Item actions ──

  if (action === 'mark_recorded' && item_id) {
    // Mark sprint item as recorded
    await supabaseAdmin
      .from('recording_sprint_items')
      .update({ status: 'recorded', recorded_at: new Date().toISOString() })
      .eq('id', item_id)
      .eq('sprint_id', id);

    // Get the content_item_id for this sprint item
    const { data: sprintItem } = await supabaseAdmin
      .from('recording_sprint_items')
      .select('content_item_id')
      .eq('id', item_id)
      .single();

    if (sprintItem) {
      // Update content item status to recorded and attach video if provided
      const ciUpdate: Record<string, unknown> = { status: 'recorded' };
      if (video_url) {
        ciUpdate.raw_video_url = video_url;
      }
      await supabaseAdmin
        .from('content_items')
        .update(ciUpdate)
        .eq('id', sprintItem.content_item_id);
    }

    // Update sprint counters
    const newCompleted = sprint.completed_items + 1;
    const totalDone = newCompleted + sprint.skipped_items;
    const newIndex = Math.min(sprint.current_index + 1, sprint.total_items - 1);

    const sprintUpdate: Record<string, unknown> = {
      completed_items: newCompleted,
      current_index: newIndex,
      updated_at: new Date().toISOString(),
    };

    if (totalDone >= sprint.total_items) {
      sprintUpdate.status = 'completed';
      sprintUpdate.completed_at = new Date().toISOString();
    }

    await supabaseAdmin
      .from('recording_sprints')
      .update(sprintUpdate)
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      data: { completed_items: newCompleted, is_complete: totalDone >= sprint.total_items },
      correlation_id: correlationId,
    });
  }

  if (action === 'skip' && item_id) {
    await supabaseAdmin
      .from('recording_sprint_items')
      .update({ status: 'skipped' })
      .eq('id', item_id)
      .eq('sprint_id', id);

    const newSkipped = sprint.skipped_items + 1;
    const totalDone = sprint.completed_items + newSkipped;
    const newIndex = Math.min(sprint.current_index + 1, sprint.total_items - 1);

    const sprintUpdate: Record<string, unknown> = {
      skipped_items: newSkipped,
      current_index: newIndex,
      updated_at: new Date().toISOString(),
    };

    if (totalDone >= sprint.total_items) {
      sprintUpdate.status = 'completed';
      sprintUpdate.completed_at = new Date().toISOString();
    }

    await supabaseAdmin
      .from('recording_sprints')
      .update(sprintUpdate)
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      data: { skipped_items: newSkipped, is_complete: totalDone >= sprint.total_items },
      correlation_id: correlationId,
    });
  }

  // ── Sprint-level actions ──

  if (action === 'pause') {
    await supabaseAdmin
      .from('recording_sprints')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  }

  if (action === 'resume') {
    await supabaseAdmin
      .from('recording_sprints')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  }

  if (action === 'complete') {
    await supabaseAdmin
      .from('recording_sprints')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  }

  if (action === 'navigate' && typeof body.index === 'number') {
    const newIndex = Math.max(0, Math.min(body.index, sprint.total_items - 1));
    await supabaseAdmin
      .from('recording_sprints')
      .update({ current_index: newIndex, updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true, data: { current_index: newIndex }, correlation_id: correlationId });
  }

  return createApiErrorResponse('BAD_REQUEST', 'Invalid action', 400, correlationId);
}

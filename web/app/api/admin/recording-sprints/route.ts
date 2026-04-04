/**
 * API: Recording Sprints
 *
 * GET  /api/admin/recording-sprints           — list sprints
 * POST /api/admin/recording-sprints           — create sprint from experiment
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const experimentId = searchParams.get('experiment_id');

  let query = supabaseAdmin
    .from('recording_sprints')
    .select('*, experiments!experiment_id(name, product_id)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);
  if (experimentId) query = query.eq('experiment_id', experimentId);

  const { data, error } = await query;

  if (error) {
    console.error('[recording-sprints] list error:', error.message);
    return createApiErrorResponse('DB_ERROR', 'Failed to list sprints', 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { experiment_id, timer_minutes } = body;

  if (!experiment_id) {
    return createApiErrorResponse('BAD_REQUEST', 'experiment_id is required', 400, correlationId);
  }

  // 1. Verify experiment exists and belongs to workspace
  const { data: experiment } = await supabaseAdmin
    .from('experiments')
    .select('id, name, workspace_id')
    .eq('id', experiment_id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!experiment) {
    return createApiErrorResponse('NOT_FOUND', 'Experiment not found', 404, correlationId);
  }

  // 2. Fetch content items linked to this experiment via experiment_creatives
  const { data: creatives } = await supabaseAdmin
    .from('experiment_creatives')
    .select(`
      id, hook, angle, persona,
      content_item:content_items!content_item_id(
        id, title, status, primary_hook, script_text, script_json
      )
    `)
    .eq('experiment_id', experiment_id)
    .order('created_at', { ascending: true });

  if (!creatives || creatives.length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'Experiment has no content items', 400, correlationId);
  }

  // 3. Flatten and filter to recordable items
  interface CreativeRow {
    id: string;
    hook: string | null;
    angle: string | null;
    persona: string | null;
    content_item: Array<{
      id: string;
      title: string;
      status: string;
      primary_hook: string | null;
      script_text: string | null;
      script_json: Record<string, unknown> | null;
    }> | null;
  }

  const items = (creatives as unknown as CreativeRow[])
    .map(c => {
      const ci = Array.isArray(c.content_item) ? c.content_item[0] : c.content_item;
      if (!ci) return null;
      return { creative: c, contentItem: ci };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter(item => {
      // Include items that haven't been recorded yet
      const s = item.contentItem.status;
      return s === 'briefing' || s === 'scripted' || s === 'ready_to_record';
    });

  if (items.length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No recordable items in experiment (all may already be recorded)', 400, correlationId);
  }

  // 4. Sort: items with hooks first, then by hook text for consistency
  items.sort((a, b) => {
    const hookA = a.creative.hook || a.contentItem.primary_hook || '';
    const hookB = b.creative.hook || b.contentItem.primary_hook || '';
    if (hookA && !hookB) return -1;
    if (!hookA && hookB) return 1;
    return hookA.localeCompare(hookB);
  });

  // 5. Create sprint
  const { data: sprint, error: sprintErr } = await supabaseAdmin
    .from('recording_sprints')
    .insert({
      workspace_id: workspaceId,
      experiment_id,
      name: `Sprint: ${experiment.name}`,
      status: 'active',
      total_items: items.length,
      completed_items: 0,
      skipped_items: 0,
      current_index: 0,
      timer_minutes: timer_minutes && timer_minutes >= 5 ? Math.min(timer_minutes, 120) : null,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (sprintErr || !sprint) {
    console.error('[recording-sprints] create error:', sprintErr?.message);
    return createApiErrorResponse('DB_ERROR', 'Failed to create sprint', 500, correlationId);
  }

  // 6. Create sprint items
  const sprintItems = items.map((item, index) => ({
    sprint_id: sprint.id,
    content_item_id: item.contentItem.id,
    sort_order: index,
    status: 'pending',
  }));

  const { error: itemsErr } = await supabaseAdmin
    .from('recording_sprint_items')
    .insert(sprintItems);

  if (itemsErr) {
    console.error('[recording-sprints] items insert error:', itemsErr.message);
    // Clean up sprint
    await supabaseAdmin.from('recording_sprints').delete().eq('id', sprint.id);
    return createApiErrorResponse('DB_ERROR', 'Failed to create sprint items', 500, correlationId);
  }

  // 7. Transition content items to ready_to_record if they're in briefing/scripted
  const itemIds = items.map(i => i.contentItem.id);
  await supabaseAdmin
    .from('content_items')
    .update({ status: 'ready_to_record' })
    .in('id', itemIds)
    .in('status', ['briefing', 'scripted']);

  return NextResponse.json({
    ok: true,
    data: {
      sprint_id: sprint.id,
      total_items: items.length,
      experiment_name: experiment.name,
    },
    correlation_id: correlationId,
  }, { status: 201 });
}

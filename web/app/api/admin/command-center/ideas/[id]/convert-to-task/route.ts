/**
 * POST /api/admin/command-center/ideas/:id/convert-to-task
 *
 * Owner-only. Creates a project_task from an idea, links via meta, and logs a task_event.
 *
 * Body: { project_id, initiative_id?, title?, risk_tier?, assigned_agent? }
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { id: ideaId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id, title, risk_tier, assigned_agent } = body;

  if (!project_id || typeof project_id !== 'string') {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  // Fetch the idea to prefill
  const { data: idea, error: ideaErr } = await supabaseAdmin
    .from('ideas')
    .select('title, prompt, priority, mode, tags')
    .eq('id', ideaId)
    .single();

  if (ideaErr || !idea) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  }

  const taskTitle = (typeof title === 'string' && title.trim()) ? title : `[Idea] ${idea.title}`;
  const taskRisk = (typeof risk_tier === 'string' && ['low', 'medium', 'high'].includes(risk_tier)) ? risk_tier : 'medium';
  const taskAgent = (typeof assigned_agent === 'string' && assigned_agent.trim()) ? assigned_agent : 'unassigned';

  // Create the project task
  const { data: task, error: taskErr } = await supabaseAdmin
    .from('project_tasks')
    .insert({
      project_id,
      title: taskTitle,
      description: idea.prompt || `Converted from idea: ${idea.title}`,
      assigned_agent: taskAgent,
      status: 'queued',
      priority: idea.priority,
      risk_tier: taskRisk,
      meta: { source_idea_id: ideaId, converted_at: new Date().toISOString() },
    })
    .select('id, title')
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: taskErr?.message || 'Failed to create task' }, { status: 500 });
  }

  // Log task_event
  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    agent_id: 'human',
    event_type: 'created',
    payload: { source: 'idea_conversion', idea_id: ideaId, idea_title: idea.title },
  });

  // Update idea status to 'building' and link the task
  await supabaseAdmin
    .from('ideas')
    .update({
      status: 'building',
      meta: {
        converted_task_id: task.id,
        converted_at: new Date().toISOString(),
      },
    })
    .eq('id', ideaId);

  return NextResponse.json({
    ok: true,
    data: { task_id: task.id, task_title: task.title },
  });
}

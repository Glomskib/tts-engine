/**
 * POST /api/admin/command-center/quick-actions
 *
 * Owner-only. Handles operator actions from the Command Center.
 * Actions: reclaim_stale, requeue, mark_blocked, assign_agent,
 *          mark_awaiting_review, resolve_intervention, acknowledge_incident,
 *          complete_with_proof, dismiss_intervention
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface ActionPayload {
  action: string;
  task_id?: string;
  intervention_id?: string;
  incident_id?: string;
  agent_id?: string;
  reason?: string;
  lane?: string;
  proof_summary?: string;
  proof_url?: string;
}

/** Best-effort insert into task_transitions — non-blocking if table doesn't exist yet */
async function logTransition(taskId: string, fromStatus: string | null, toStatus: string, reason: string) {
  try {
    await supabaseAdmin.from('task_transitions').insert({
      task_id: taskId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: 'operator',
      reason,
    });
  } catch {
    // task_transitions table may not exist yet pre-migration — non-fatal
  }
}

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  let body: ActionPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;
  const now = new Date().toISOString();

  try {
    switch (action) {
      case 'reclaim_stale': {
        if (!body.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('project_tasks')
          .update({
            status: 'queued',
            assigned_agent: '',
            claimed_at: null,
            started_at: null,
            heartbeat_at: null,
            escalation_level: 1,
            last_transition_at: now,
            updated_at: now,
          })
          .eq('id', body.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logTransition(body.task_id, 'active', 'queued', body.reason || 'Reclaimed stale task');
        break;
      }

      case 'requeue': {
        if (!body.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('project_tasks')
          .update({
            status: 'queued',
            blocked_reason: null,
            claimed_at: null,
            started_at: null,
            heartbeat_at: null,
            last_transition_at: now,
            updated_at: now,
          })
          .eq('id', body.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logTransition(body.task_id, null, 'queued', body.reason || 'Requeued by operator');
        break;
      }

      case 'mark_blocked': {
        if (!body.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('project_tasks')
          .update({
            status: 'blocked',
            blocked_reason: body.reason || 'Blocked by operator',
            last_transition_at: now,
            updated_at: now,
          })
          .eq('id', body.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logTransition(body.task_id, null, 'blocked', body.reason || 'Marked blocked');
        break;
      }

      case 'assign_agent': {
        if (!body.task_id || !body.agent_id) {
          return NextResponse.json({ error: 'task_id and agent_id required' }, { status: 400 });
        }
        const { error } = await supabaseAdmin
          .from('project_tasks')
          .update({
            assigned_agent: body.agent_id,
            last_transition_at: now,
            updated_at: now,
          })
          .eq('id', body.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        break;
      }

      case 'mark_awaiting_review': {
        if (!body.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('project_tasks')
          .update({
            requires_human_review: true,
            last_transition_at: now,
            updated_at: now,
          })
          .eq('id', body.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        break;
      }

      case 'complete_with_proof': {
        if (!body.task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('project_tasks')
          .update({
            status: 'done',
            completed_at: now,
            proof_summary: body.proof_summary || null,
            proof_url: body.proof_url || null,
            human_override: !body.proof_summary && !body.proof_url,
            last_transition_at: now,
            updated_at: now,
          })
          .eq('id', body.task_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logTransition(body.task_id, null, 'done', body.proof_summary || 'Completed by operator (human override)');
        break;
      }

      case 'resolve_intervention': {
        if (!body.intervention_id) return NextResponse.json({ error: 'intervention_id required' }, { status: 400 });
        try {
          const { error } = await supabaseAdmin
            .from('intervention_queue')
            .update({
              status: 'resolved',
              resolved_at: now,
              resolved_by: 'operator',
              resolution_note: body.reason || 'Resolved by operator',
              updated_at: now,
            })
            .eq('id', body.intervention_id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } catch {
          return NextResponse.json({ error: 'intervention_queue table not available' }, { status: 500 });
        }
        break;
      }

      case 'dismiss_intervention': {
        if (!body.intervention_id) return NextResponse.json({ error: 'intervention_id required' }, { status: 400 });
        try {
          const { error } = await supabaseAdmin
            .from('intervention_queue')
            .update({
              status: 'dismissed',
              resolved_at: now,
              resolved_by: 'operator',
              resolution_note: body.reason || 'Dismissed',
              updated_at: now,
            })
            .eq('id', body.intervention_id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } catch {
          return NextResponse.json({ error: 'intervention_queue table not available' }, { status: 500 });
        }
        break;
      }

      case 'acknowledge_incident': {
        if (!body.incident_id) return NextResponse.json({ error: 'incident_id required' }, { status: 400 });
        try {
          const { error } = await supabaseAdmin
            .from('incidents')
            .update({ status: 'investigating' })
            .eq('id', body.incident_id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } catch {
          return NextResponse.json({ error: 'incidents table not available' }, { status: 500 });
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, action });
  } catch (err) {
    console.error('[quick-actions] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

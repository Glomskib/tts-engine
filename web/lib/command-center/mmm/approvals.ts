/**
 * MMM approval queue — unified read across existing tables.
 *
 * No new table. Every agent-created row across `marketing_posts`, `project_tasks`,
 * `ideas`, and `idea_artifacts` carries the same metadata contract:
 *
 *   meta: {
 *     source: 'agent',
 *     agent_id: 'bolt-miles',
 *     requires_approval: true,
 *     approval_status: 'pending' | 'approved' | 'rejected',
 *     approval_type: ApprovalKind,
 *     approved_at?: string,
 *     approved_by?: string,
 *     rejection_reason?: string,
 *     related_event_slug?: string,
 *     group_slug: 'making-miles-matter',
 *     is_demo: false,
 *   }
 *
 * The dashboard's "Needs Approval" section reads pending items grouped by kind.
 * Approve/reject API routes update meta + (when relevant) flip the row's status
 * (e.g. social_post: pending→scheduled on approve, pending→cancelled on reject).
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const APPROVAL_KINDS = [
  'social_post',
  'task',
  'research',
  'weekly_digest',
  'meeting_summary',
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  title: string;
  preview: string;
  agent_id: string;
  related_event_slug: string | null;
  created_at: string;
  approval_status: ApprovalStatus;
  source_table: 'marketing_posts' | 'project_tasks' | 'ideas' | 'idea_artifacts';
}

interface MetaShape {
  source?: string;
  agent_id?: string;
  requires_approval?: boolean;
  approval_status?: string;
  approval_type?: string;
  approved_at?: string;
  approved_by?: string;
  rejection_reason?: string;
  related_event_slug?: string;
  group_slug?: string;
  is_demo?: boolean;
}

function isPendingMeta(meta: MetaShape | null | undefined): boolean {
  if (!meta) return false;
  if (meta.requires_approval !== true) return false;
  return (meta.approval_status || 'pending') === 'pending';
}

function isMmmMeta(meta: MetaShape | null | undefined): boolean {
  if (!meta) return false;
  return meta.group_slug === 'making-miles-matter';
}

export async function fetchPendingApprovals(): Promise<ApprovalItem[]> {
  const items: ApprovalItem[] = [];

  // --- marketing_posts (social drafts + weekly digests live here) ---
  const { data: posts } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, content, created_at, meta, source')
    .eq('source', 'bolt-miles')
    .order('created_at', { ascending: false })
    .limit(50);
  for (const r of (posts || []) as Array<{ id: string; content: string; created_at: string; meta: MetaShape | null }>) {
    if (!isPendingMeta(r.meta) || !isMmmMeta(r.meta)) continue;
    const kind: ApprovalKind = r.meta?.approval_type === 'weekly_digest' ? 'weekly_digest' : 'social_post';
    items.push({
      id: r.id,
      kind,
      title: kind === 'weekly_digest' ? 'Weekly MMM digest' : 'Social post draft',
      preview: r.content.slice(0, 240),
      agent_id: r.meta?.agent_id || 'bolt-miles',
      related_event_slug: r.meta?.related_event_slug || null,
      created_at: r.created_at,
      approval_status: 'pending',
      source_table: 'marketing_posts',
    });
  }

  // --- project_tasks (agent-suggested tasks) ---
  const { data: tasks } = await supabaseAdmin
    .from('project_tasks')
    .select('id, title, description, created_at, meta')
    .order('created_at', { ascending: false })
    .limit(100);
  for (const r of (tasks || []) as Array<{ id: string; title: string; description: string | null; created_at: string; meta: MetaShape | null }>) {
    if (!isPendingMeta(r.meta) || !isMmmMeta(r.meta)) continue;
    items.push({
      id: r.id,
      kind: 'task',
      title: r.title,
      preview: (r.description || '').slice(0, 240),
      agent_id: r.meta?.agent_id || 'bolt-miles',
      related_event_slug: r.meta?.related_event_slug || null,
      created_at: r.created_at,
      approval_status: 'pending',
      source_table: 'project_tasks',
    });
  }

  // --- ideas (agent-suggested research items) ---
  const { data: ideas } = await supabaseAdmin
    .from('ideas')
    .select('id, title, prompt, created_at, meta')
    .or('tags.cs.{mmm},tags.cs.{bike-event-research}')
    .order('created_at', { ascending: false })
    .limit(50);
  for (const r of (ideas || []) as Array<{ id: string; title: string; prompt: string | null; created_at: string; meta: MetaShape | null }>) {
    if (!isPendingMeta(r.meta) || !isMmmMeta(r.meta)) continue;
    items.push({
      id: r.id,
      kind: 'research',
      title: r.title,
      preview: (r.prompt || '').slice(0, 240),
      agent_id: r.meta?.agent_id || 'bolt-miles',
      related_event_slug: r.meta?.related_event_slug || null,
      created_at: r.created_at,
      approval_status: 'pending',
      source_table: 'ideas',
    });
  }

  // --- idea_artifacts (meeting summaries) ---
  const { data: artifacts } = await supabaseAdmin
    .from('idea_artifacts')
    .select('id, content_md, ts, meta, artifact_type')
    .eq('artifact_type', 'summary')
    .order('ts', { ascending: false })
    .limit(50);
  for (const r of (artifacts || []) as Array<{ id: string; content_md: string; ts: string; meta: MetaShape | null }>) {
    if (!isPendingMeta(r.meta) || !isMmmMeta(r.meta)) continue;
    items.push({
      id: r.id,
      kind: 'meeting_summary',
      title: 'Meeting summary draft',
      preview: r.content_md.slice(0, 240),
      agent_id: r.meta?.agent_id || 'bolt-miles',
      related_event_slug: r.meta?.related_event_slug || null,
      created_at: r.ts,
      approval_status: 'pending',
      source_table: 'idea_artifacts',
    });
  }

  return items.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

interface DecisionInput {
  kind: ApprovalKind;
  id: string;
  decision: 'approved' | 'rejected';
  reviewer_email: string;
  rejection_reason?: string;
}

export async function applyApprovalDecision(input: DecisionInput): Promise<{
  ok: boolean;
  table: ApprovalItem['source_table'];
  side_effects: string[];
  error?: string;
}> {
  const sideEffects: string[] = [];

  const tableForKind: Record<ApprovalKind, ApprovalItem['source_table']> = {
    social_post: 'marketing_posts',
    weekly_digest: 'marketing_posts',
    task: 'project_tasks',
    research: 'ideas',
    meeting_summary: 'idea_artifacts',
  };
  const table = tableForKind[input.kind];

  // 1. Read current meta + scheduled_for (for marketing_posts) so we can merge cleanly.
  // Supabase typing on a runtime-varying select string trips strict mode, so cast through unknown.
  const selectCols =
    table === 'marketing_posts' ? 'id, meta, scheduled_for' : 'id, meta';
  const readResult = (await supabaseAdmin
    .from(table)
    .select(selectCols)
    .eq('id', input.id)
    .single()) as unknown as {
    data: { meta: MetaShape | null; scheduled_for?: string | null } | null;
    error: { message: string } | null;
  };
  if (readResult.error || !readResult.data) {
    return {
      ok: false,
      table,
      side_effects: [],
      error: readResult.error?.message || 'Row not found',
    };
  }
  const existingRow = readResult.data;
  const oldMeta = (existingRow.meta || {}) as MetaShape;

  const newMeta: MetaShape = {
    ...oldMeta,
    approval_status: input.decision,
    approved_at: input.decision === 'approved' ? new Date().toISOString() : oldMeta.approved_at,
    approved_by: input.decision === 'approved' ? input.reviewer_email : oldMeta.approved_by,
    rejection_reason:
      input.decision === 'rejected' ? input.rejection_reason || 'No reason provided' : undefined,
  };

  // 2. Patch meta. For social_post and weekly_digest, also flip the row's status:
  //    approve → 'scheduled' (with a default scheduled_for if currently null),
  //    reject → 'cancelled' (per marketing_posts CHECK constraint).
  const updatePayload: Record<string, unknown> = { meta: newMeta };
  if (input.kind === 'social_post' || input.kind === 'weekly_digest') {
    updatePayload.status = input.decision === 'approved' ? 'scheduled' : 'cancelled';
    sideEffects.push(`marketing_posts.status → ${updatePayload.status}`);
    if (input.decision === 'approved' && !existingRow.scheduled_for) {
      // Default to ~1h from approval — gives the operator time to back out if needed.
      const oneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      updatePayload.scheduled_for = oneHour;
      sideEffects.push(`marketing_posts.scheduled_for → ${oneHour} (default +1h)`);
    }
  }
  // For tasks: approve = ready to work (queued), reject = killed
  if (input.kind === 'task') {
    updatePayload.status = input.decision === 'approved' ? 'queued' : 'killed';
    sideEffects.push(`project_tasks.status → ${updatePayload.status}`);
  }
  // For research: approve = idea moves into queued status to be worked
  if (input.kind === 'research') {
    updatePayload.status = input.decision === 'approved' ? 'queued' : 'killed';
    sideEffects.push(`ideas.status → ${updatePayload.status}`);
  }

  const { error: updErr } = await supabaseAdmin.from(table).update(updatePayload).eq('id', input.id);
  if (updErr) {
    return { ok: false, table, side_effects: sideEffects, error: updErr.message };
  }

  return { ok: true, table, side_effects: sideEffects };
}

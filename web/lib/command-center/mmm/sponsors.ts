/**
 * MMM sponsors pipeline reader.
 *
 * Reuses the existing `mmm-sponsors` CRM pipeline (slug pre-seeded by the
 * 20260225000001_crm_pipeline.sql migration). Builds a UI-shaped summary plus
 * the underlying deals list, plus recent activities, plus next follow-ups.
 *
 * Stage map (existing): lead → researched → outreach-sent → follow-up →
 * negotiation → confirmed → fulfilled. We treat `confirmed` as "Committed",
 * `fulfilled` as "Paid". A `meta.declined=true` flag handles "Declined" without
 * adding a new stage to the pipeline.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { MmmSponsorPipeline, MmmSponsorDeal } from './types';

const PIPELINE_SLUG = 'mmm-sponsors';
const SPONSOR_GOAL = 8;

interface PipelineRow {
  id: string;
  slug: string;
  name: string;
  stages: Array<{ key: string; label: string; color: string; position: number }> | null;
}

interface DealRow {
  id: string;
  pipeline_id: string;
  contact_id: string | null;
  title: string;
  stage_key: string;
  value_cents: number | null;
  notes: string | null;
  meta: Record<string, unknown> | null;
  stage_entered_at: string | null;
  updated_at: string | null;
  contact?: { name: string | null; email: string | null } | null;
}

interface ActivityRow {
  id: string;
  deal_id: string | null;
  activity_type: string;
  subject: string | null;
  body: string | null;
  ts: string;
}

function emptyPipeline(): MmmSponsorPipeline {
  return {
    pipeline_id: null,
    pipeline_slug: PIPELINE_SLUG,
    pipeline_name: 'MMM Sponsors',
    stages: [],
    deals: [],
    goal: SPONSOR_GOAL,
    committed_count: 0,
    paid_count: 0,
    unpaid_committed_count: 0,
    total_committed_cents: 0,
    total_paid_cents: 0,
    next_followups: [],
    recent_activities: [],
  };
}

export async function getMmmSponsorPipeline(): Promise<MmmSponsorPipeline> {
  const { data: pipelineRow } = await supabaseAdmin
    .from('crm_pipelines')
    .select('id, slug, name, stages')
    .eq('slug', PIPELINE_SLUG)
    .maybeSingle();

  if (!pipelineRow) return emptyPipeline();
  const pipeline = pipelineRow as PipelineRow;
  const stages = (pipeline.stages || []).slice().sort((a, b) => a.position - b.position);
  const stageByKey = new Map(stages.map((s) => [s.key, s]));

  const dealsResult = (await supabaseAdmin
    .from('crm_deals')
    .select('id, pipeline_id, contact_id, title, stage_key, value_cents, notes, meta, stage_entered_at, updated_at, crm_contacts(name, email)')
    .eq('pipeline_id', pipeline.id)
    .order('stage_entered_at', { ascending: false })) as unknown as {
    data:
      | Array<
          DealRow & {
            crm_contacts?:
              | { name: string | null; email: string | null }
              | Array<{ name: string | null; email: string | null }>
              | null;
          }
        >
      | null;
  };

  const deals: MmmSponsorDeal[] = (dealsResult.data || []).map((d) => {
    const stage = stageByKey.get(d.stage_key);
    const meta = (d.meta || {}) as { is_demo?: boolean; declined?: boolean };
    // crm_contacts can be either a single object or an array depending on the
    // PostgREST shape; normalize to a single object.
    const contact = Array.isArray(d.crm_contacts)
      ? d.crm_contacts[0] || null
      : d.crm_contacts || null;
    return {
      id: d.id,
      title: d.title,
      stage_key: d.stage_key,
      stage_label: stage?.label || d.stage_key,
      stage_color: stage?.color || '#71717a',
      value_cents: d.value_cents,
      contact_name: contact?.name || null,
      contact_email: contact?.email || null,
      notes: d.notes,
      is_demo: meta.is_demo === true,
      declined: meta.declined === true,
      stage_entered_at: d.stage_entered_at,
      last_activity_at: d.updated_at,
    };
  });

  const dealIds = deals.map((d) => d.id);
  const { data: rawActivities } =
    dealIds.length > 0
      ? await supabaseAdmin
          .from('crm_activities')
          .select('id, deal_id, activity_type, subject, body, ts')
          .in('deal_id', dealIds)
          .order('ts', { ascending: false })
          .limit(20)
      : { data: [] as ActivityRow[] };

  const recentActivities = ((rawActivities || []) as ActivityRow[]).map((a) => ({
    id: a.id,
    deal_id: a.deal_id,
    activity_type: a.activity_type,
    subject: a.subject,
    body: a.body,
    ts: a.ts,
  }));

  // Aggregates.
  const isCommitted = (d: MmmSponsorDeal) => d.stage_key === 'confirmed' && !d.declined;
  const isPaid = (d: MmmSponsorDeal) => d.stage_key === 'fulfilled' && !d.declined;
  const committed = deals.filter(isCommitted);
  const paid = deals.filter(isPaid);

  // Next follow-ups: stage = follow-up or outreach-sent or negotiation, sorted by oldest first.
  const followupStages = new Set(['outreach-sent', 'follow-up', 'negotiation']);
  const nextFollowups = deals
    .filter((d) => followupStages.has(d.stage_key) && !d.declined)
    .sort((a, b) => {
      const at = a.stage_entered_at ? new Date(a.stage_entered_at).getTime() : 0;
      const bt = b.stage_entered_at ? new Date(b.stage_entered_at).getTime() : 0;
      return at - bt;
    })
    .slice(0, 6)
    .map((d) => ({
      id: d.id,
      title: d.title,
      stage_label: d.stage_label,
      due_in_days: d.stage_entered_at
        ? Math.max(
            0,
            Math.floor((Date.now() - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)),
          )
        : null,
    }));

  return {
    pipeline_id: pipeline.id,
    pipeline_slug: pipeline.slug,
    pipeline_name: pipeline.name,
    stages,
    deals,
    goal: SPONSOR_GOAL,
    committed_count: committed.length + paid.length,
    paid_count: paid.length,
    unpaid_committed_count: committed.length,
    total_committed_cents: committed.reduce((s, d) => s + (d.value_cents || 0), 0),
    total_paid_cents: paid.reduce((s, d) => s + (d.value_cents || 0), 0),
    next_followups: nextFollowups,
    recent_activities: recentActivities,
  };
}

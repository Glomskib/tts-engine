/**
 * CRM Pipeline – Mutation helpers for deals and activities.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Move a deal to a new stage, update stage_entered_at, and auto-log a stage_change activity.
 */
export async function moveDealStage(
  dealId: string,
  newStageKey: string,
  actor: string = 'admin',
): Promise<{ success: boolean; error?: string }> {
  // Fetch current deal
  const { data: deal, error: fetchErr } = await supabaseAdmin
    .from('crm_deals')
    .select('id, stage_key, title, pipeline_id')
    .eq('id', dealId)
    .single();

  if (fetchErr || !deal) {
    return { success: false, error: fetchErr?.message || 'Deal not found' };
  }

  const oldStageKey = deal.stage_key;
  if (oldStageKey === newStageKey) {
    return { success: true }; // no-op
  }

  const now = new Date().toISOString();

  // Update deal
  const { error: updateErr } = await supabaseAdmin
    .from('crm_deals')
    .update({
      stage_key: newStageKey,
      stage_entered_at: now,
      updated_at: now,
    })
    .eq('id', dealId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Auto-log stage_change activity
  await supabaseAdmin.from('crm_activities').insert({
    deal_id: dealId,
    contact_id: null,
    activity_type: 'stage_change',
    subject: `Stage: ${oldStageKey} → ${newStageKey}`,
    body: '',
    actor,
    meta: { old_stage: oldStageKey, new_stage: newStageKey },
  });

  return { success: true };
}

/**
 * Create a CRM activity record.
 */
export async function createDealActivity(params: {
  deal_id?: string | null;
  contact_id?: string | null;
  activity_type: string;
  subject?: string;
  body?: string;
  source_id?: string | null;
  actor?: string;
  meta?: Record<string, unknown>;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('crm_activities')
    .insert({
      deal_id: params.deal_id ?? null,
      contact_id: params.contact_id ?? null,
      activity_type: params.activity_type,
      subject: params.subject ?? '',
      body: params.body ?? '',
      source_id: params.source_id ?? null,
      actor: params.actor ?? 'admin',
      meta: params.meta ?? {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('[crm-ingest] createDealActivity failed:', error.message);
    return null;
  }

  return data;
}

/**
 * Find a contact by email, or create one if it doesn't exist.
 */
export async function findOrCreateContactByEmail(
  email: string,
  name?: string,
  source?: string,
): Promise<{ id: string; name: string; email: string } | null> {
  // Try to find existing
  const { data: existing } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, name, email')
    .eq('email', email)
    .single();

  if (existing) return existing;

  // Create new
  const { data: created, error } = await supabaseAdmin
    .from('crm_contacts')
    .insert({
      name: name || email.split('@')[0],
      email,
      source: source || 'auto',
    })
    .select('id, name, email')
    .single();

  if (error) {
    console.error('[crm-ingest] findOrCreateContactByEmail failed:', error.message);
    return null;
  }

  return created;
}

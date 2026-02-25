// ============================================================
// Marketplace Supabase query helpers (server-side)
// ============================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  MpScript, EditJob, ScriptAsset, JobFeedback, JobDeliverable,
  JobEvent, BrollAsset, ScriptBrollLink, PipelineRow, MetricsSummary,
  JobWithScript, ScriptStatus, JobStatus, FeedbackRole, PlanTier,
} from './types';
import {
  getNextAction, computeDueAt, getClientToday, computeSlaFields,
  PLAN_TIER_DEFAULTS, planTierLabel,
} from './types';
import { checkDailyCap, checkPlanActive, isPlanBillable } from './usage';
import { computePriorityWeight } from '@/lib/ops/priorityEngine';

// ============================================================
// Structured error class
// ============================================================

export class MarketplaceError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'MarketplaceError';
  }
}

// ============================================================
// Valid state transitions
// ============================================================

export const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued:             ['claimed', 'canceled', 'blocked', 'error'],
  claimed:            ['in_progress', 'queued', 'canceled'],        // queued = unclaim
  in_progress:        ['submitted', 'blocked', 'error', 'canceled'],
  submitted:          ['approved', 'changes_requested'],
  changes_requested:  ['in_progress', 'submitted', 'canceled'],     // VA can start or re-submit
  approved:           ['posted'],
  posted:             [],
  blocked:            ['queued', 'canceled'],
  error:              ['queued', 'canceled'],
  canceled:           [],
};

export function validateTransition(current: JobStatus, next: JobStatus): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new MarketplaceError(
      `Invalid transition: ${current} → ${next}`,
      'INVALID_TRANSITION',
      409,
    );
  }
}

// ============================================================
// Heartbeat & stalled job detection
// ============================================================

const STALLED_THRESHOLD_MINUTES = 45;

/** Update last_heartbeat_at on a job (fire-and-forget, never throws) */
async function touchHeartbeat(jobId: string): Promise<void> {
  try {
    await supabaseAdmin.from('edit_jobs')
      .update({ last_heartbeat_at: new Date().toISOString(), stalled_at: null })
      .eq('id', jobId)
      .in('job_status', ['claimed', 'in_progress', 'changes_requested']);
  } catch { /* best-effort */ }
}

/** List jobs that are in_progress but haven't had a heartbeat in 45+ minutes */
export async function getStalledJobs() {
  const cutoff = new Date(Date.now() - STALLED_THRESHOLD_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('edit_jobs')
    .select(`
      id, script_id, client_id, job_status, claimed_by, due_at,
      last_heartbeat_at, stalled_at, created_at,
      mp_scripts:mp_scripts!edit_jobs_script_id_fkey(title),
      clients:clients!edit_jobs_client_id_fkey(client_code)
    `)
    .eq('job_status', 'in_progress')
    .lt('last_heartbeat_at', cutoff)
    .order('last_heartbeat_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((j: Record<string, unknown>) => ({
    id: j.id as string,
    script_id: j.script_id as string,
    client_id: j.client_id as string,
    client_code: (j.clients as Record<string, string>)?.client_code || '',
    script_title: ((j.mp_scripts as Record<string, unknown>)?.title as string) || '',
    claimed_by: j.claimed_by as string | null,
    due_at: j.due_at as string | null,
    last_heartbeat_at: j.last_heartbeat_at as string | null,
    stalled_at: j.stalled_at as string | null,
    stalled_minutes: j.last_heartbeat_at
      ? Math.round((Date.now() - new Date(j.last_heartbeat_at as string).getTime()) / 60_000)
      : null,
  }));
}

// ============================================================
// Auth context helpers
// ============================================================

export async function getMpProfile(userId: string) {
  const sb = await createServerSupabaseClient();
  const { data } = await sb.from('mp_profiles').select('*').eq('id', userId).single();
  return data;
}

export async function getUserClientIds(userId: string): Promise<string[]> {
  const sb = await createServerSupabaseClient();
  const { data } = await sb.from('client_memberships').select('client_id').eq('user_id', userId);
  return (data || []).map(r => r.client_id);
}

export async function getFirstClientId(userId: string): Promise<string | null> {
  const ids = await getUserClientIds(userId);
  return ids[0] || null;
}

// ============================================================
// Client pipeline
// ============================================================

export async function getPipelineRows(clientId: string): Promise<PipelineRow[]> {
  const sb = await createServerSupabaseClient();

  const { data: scripts, error } = await sb
    .from('mp_scripts')
    .select(`
      id, title, status, created_at, updated_at,
      edit_jobs:edit_jobs(job_status, claimed_by, due_at),
      script_assets:script_assets(asset_type),
      job_deliverables:edit_jobs(job_deliverables(id))
    `)
    .eq('client_id', clientId)
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false });

  if (error || !scripts) return [];

  return scripts.map((s: Record<string, unknown>) => {
    const job = Array.isArray(s.edit_jobs) && s.edit_jobs.length > 0 ? s.edit_jobs[0] : null;
    const assets = (s.script_assets || []) as { asset_type: string }[];
    const hasRaw = assets.some(a => a.asset_type === 'raw_folder' || a.asset_type === 'raw_video');

    // Check deliverables through the job
    const jobWithDeliverables = Array.isArray(s.job_deliverables) && s.job_deliverables.length > 0
      ? s.job_deliverables[0] : null;
    const deliverables = jobWithDeliverables && Array.isArray((jobWithDeliverables as Record<string, unknown>).job_deliverables)
      ? (jobWithDeliverables as Record<string, unknown>).job_deliverables as unknown[]
      : [];
    const hasDeliverable = deliverables.length > 0;

    return {
      id: s.id as string,
      title: s.title as string,
      status: s.status as ScriptStatus,
      job_status: job?.job_status as JobStatus | null ?? null,
      created_at: s.created_at as string,
      updated_at: s.updated_at as string,
      has_raw_footage: hasRaw,
      has_deliverable: hasDeliverable,
      assigned_editor: job?.claimed_by ?? null,
      due_at: job?.due_at ?? null,
      next_action: getNextAction(s.status as ScriptStatus, job?.job_status as JobStatus | null ?? null),
    };
  });
}

// ============================================================
// Script CRUD
// ============================================================

export async function getScript(scriptId: string) {
  const sb = await createServerSupabaseClient();
  const { data } = await sb.from('mp_scripts').select('*').eq('id', scriptId).single();
  return data as MpScript | null;
}

export async function getScriptWithAssets(scriptId: string) {
  const sb = await createServerSupabaseClient();
  const [scriptRes, assetsRes, jobRes, brollRes] = await Promise.all([
    sb.from('mp_scripts').select('*').eq('id', scriptId).single(),
    sb.from('script_assets').select('*').eq('script_id', scriptId).order('created_at'),
    sb.from('edit_jobs').select('id').eq('script_id', scriptId).order('created_at', { ascending: false }).limit(1),
    sb.from('script_broll_links')
      .select('*, broll_assets:broll_assets!script_broll_links_broll_asset_id_fkey(*)')
      .eq('script_id', scriptId),
  ]);

  // Generate signed URLs for broll assets
  const brollPack = await Promise.all(
    (brollRes.data || []).map(async (bl: Record<string, unknown>) => {
      const asset = bl.broll_assets as Record<string, unknown> | null;
      let signedUrl: string | null = null;
      if (asset?.storage_bucket && asset?.storage_path) {
        const { data: urlData } = await sb.storage
          .from(asset.storage_bucket as string)
          .createSignedUrl(asset.storage_path as string, 3600);
        signedUrl = urlData?.signedUrl || null;
      }
      return {
        notes: bl.notes as string | null,
        recommended_for: bl.recommended_for as string | null,
        signed_url: signedUrl,
        asset: asset ? {
          id: asset.id as string,
          source_type: asset.source_type as string,
          prompt: asset.prompt as string | null,
          tags: asset.tags as string[],
          duration_seconds: asset.duration_seconds as number | null,
        } : null,
      };
    })
  );

  const jobId = jobRes.data && jobRes.data.length > 0 ? jobRes.data[0].id : null;

  return {
    script: scriptRes.data as MpScript | null,
    assets: (assetsRes.data || []) as ScriptAsset[],
    job_id: jobId as string | null,
    broll_pack: brollPack,
  };
}

export async function createScript(
  clientId: string,
  userId: string,
  data: { title: string; script_text?: string; notes?: string; broll_suggestions?: string; keep_verbatim?: string; references?: unknown[] }
) {
  const sb = await createServerSupabaseClient();
  const { data: script, error } = await sb.from('mp_scripts').insert({
    client_id: clientId,
    title: data.title,
    script_text: data.script_text || null,
    notes: data.notes || null,
    broll_suggestions: data.broll_suggestions || null,
    keep_verbatim: data.keep_verbatim || null,
    references: data.references || [],
    status: 'draft',
    created_by: userId,
  }).select().single();
  if (error) throw new Error(error.message);
  return script as MpScript;
}

export async function updateScript(
  scriptId: string,
  data: Partial<Pick<MpScript, 'title' | 'script_text' | 'notes' | 'broll_suggestions' | 'keep_verbatim' | 'references' | 'variation_map'>>
) {
  const sb = await createServerSupabaseClient();
  const { data: script, error } = await sb.from('mp_scripts').update(data).eq('id', scriptId).select().single();
  if (error) throw new Error(error.message);
  return script as MpScript;
}

export async function updateScriptStatus(scriptId: string, status: ScriptStatus) {
  const sb = await createServerSupabaseClient();
  const { error } = await sb.from('mp_scripts').update({ status }).eq('id', scriptId);
  if (error) throw new Error(error.message);
}

// ============================================================
// Script assets
// ============================================================

export async function addScriptAsset(
  scriptId: string,
  userId: string,
  data: { asset_type: string; label?: string; url?: string }
) {
  const sb = await createServerSupabaseClient();
  const { data: asset, error } = await sb.from('script_assets').insert({
    script_id: scriptId,
    asset_type: data.asset_type,
    label: data.label || null,
    url: data.url || null,
    created_by: userId,
  }).select().single();
  if (error) throw new Error(error.message);
  return asset as ScriptAsset;
}

// ============================================================
// Queue for editing (with cap enforcement)
// ============================================================

export async function queueForEditing(scriptId: string, clientId: string, userId: string) {
  const svc = supabaseAdmin;

  // Idempotency: if an active job already exists, return it instead of creating a new one
  const ACTIVE_STATUSES: JobStatus[] = ['queued', 'claimed', 'in_progress', 'submitted', 'changes_requested'];
  const { data: activeJob } = await svc
    .from('edit_jobs')
    .select('id, job_status')
    .eq('script_id', scriptId)
    .in('job_status', ACTIVE_STATUSES)
    .limit(1)
    .single();

  if (activeJob) {
    return { jobId: activeJob.id as string, status: activeJob.job_status as JobStatus, existing: true };
  }

  // Entitlement gate: plan must be active or trialing
  await checkPlanActive(clientId);

  // Check daily cap via shared helper
  const { allowed, usage: capUsage } = await checkDailyCap(clientId);

  // Derive plan fields from cap check result
  const tier = capUsage.plan_tier;
  const tierConfig = PLAN_TIER_DEFAULTS[tier] || PLAN_TIER_DEFAULTS.pool_15;
  const slaHours = capUsage.sla_hours;
  const priorityWeight = tierConfig.priority_weight;
  const today = capUsage.date;
  const currentCount = capUsage.used_today;

  // Upsert usage (count the attempt regardless of throttle)
  await svc.from('plan_usage_daily').upsert({
    client_id: clientId,
    date: today,
    submitted_count: currentCount + 1,
  }, { onConflict: 'client_id,date' });

  const dueAt = computeDueAt(slaHours);

  // If daily cap exceeded: still create the job but mark as blocked.
  // Blocked jobs are excluded from the VA queue automatically.
  if (!allowed) {
    await svc.from('mp_scripts').update({ status: 'blocked' }).eq('id', scriptId);

    const { data: existingJob } = await svc.from('edit_jobs')
      .select('id, job_status')
      .eq('script_id', scriptId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let jobId: string;
    if (existingJob) {
      await svc.from('edit_jobs').update({
        job_status: 'blocked',
        priority: priorityWeight,
        due_at: dueAt,
        blocked_reason: 'DAILY_CAP_EXCEEDED',
        claimed_by: null, claimed_at: null, started_at: null, submitted_at: null,
      }).eq('id', existingJob.id);
      jobId = existingJob.id;
    } else {
      const { data: newJob, error } = await svc.from('edit_jobs').insert({
        script_id: scriptId,
        client_id: clientId,
        job_status: 'blocked',
        priority: priorityWeight,
        due_at: dueAt,
        blocked_reason: 'DAILY_CAP_EXCEEDED',
      }).select().single();
      if (error) throw new Error(error.message);
      jobId = newJob.id;
    }

    await svc.from('job_events').insert({
      job_id: jobId,
      event_type: 'blocked',
      actor_user_id: userId,
      payload: { reason: 'DAILY_CAP_EXCEEDED', usage: `${capUsage.used_today}/${capUsage.daily_cap}` },
    });

    return { jobId, status: 'blocked' as JobStatus, existing: false, queue_block_reason: 'DAILY_CAP_EXCEEDED' as const };
  }

  // Normal path: create a queued job
  await svc.from('mp_scripts').update({ status: 'queued' }).eq('id', scriptId);

  const { data: existingJob } = await svc.from('edit_jobs')
    .select('id, job_status')
    .eq('script_id', scriptId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let jobId: string;
  if (existingJob) {
    // Re-queue an existing terminal/blocked job
    await svc.from('edit_jobs').update({
      job_status: 'queued',
      priority: priorityWeight,
      due_at: dueAt,
      blocked_reason: null,
      claimed_by: null,
      claimed_at: null,
      started_at: null,
      submitted_at: null,
    }).eq('id', existingJob.id);
    jobId = existingJob.id;
  } else {
    const { data: newJob, error } = await svc.from('edit_jobs').insert({
      script_id: scriptId,
      client_id: clientId,
      job_status: 'queued',
      priority: priorityWeight,
      due_at: dueAt,
    }).select().single();
    if (error) throw new Error(error.message);
    jobId = newJob.id;
  }

  // Insert event
  await svc.from('job_events').insert({
    job_id: jobId,
    event_type: 'queued',
    actor_user_id: userId,
  });

  return { jobId, status: 'queued' as JobStatus, existing: false };
}

// ============================================================
// VA job board
// ============================================================

export interface VaBoardFilters {
  sort?: 'newest' | 'due_soon' | 'priority';
  status?: 'all' | 'queued' | 'mine';
  search?: string;
  userId?: string;
}

export async function getQueuedJobs(filters?: VaBoardFilters) {
  const sb = supabaseAdmin;

  // Select client_code and plan_tier only — never client name or email
  let query = sb
    .from('edit_jobs')
    .select(`
      id, script_id, client_id, job_status, priority, claimed_by, due_at, created_at,
      mp_scripts:mp_scripts!edit_jobs_script_id_fkey(
        id, title, notes, broll_suggestions,
        script_assets(asset_type),
        script_broll_links(broll_asset_id)
      ),
      clients:clients!edit_jobs_client_id_fkey(client_code),
      client_plans:client_plans!edit_jobs_client_id_fkey(plan_tier, sla_hours, status),
      job_deliverables(id)
    `);

  // Status filter
  const statusFilter = filters?.status || 'all';
  if (statusFilter === 'queued') {
    query = query.eq('job_status', 'queued');
  } else if (statusFilter === 'mine' && filters?.userId) {
    // "My Jobs" — stable sort by due_at then created_at, regardless of sort param
    query = query.eq('claimed_by', filters.userId)
      .in('job_status', ['claimed', 'in_progress', 'changes_requested'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
  } else {
    query = query.in('job_status', ['queued', 'claimed', 'in_progress', 'submitted', 'changes_requested']);
  }

  // Queue ordering fairness:
  //   Default: priority_weight desc (higher-tier clients first), then due_at asc
  //   (most urgent first), then created_at asc (FIFO tiebreak).
  //   "My Jobs" already has its own stable sort applied above — skip here.
  if (statusFilter !== 'mine') {
    const sort = filters?.sort || 'priority';
    if (sort === 'due_soon') {
      query = query.order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
    } else if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else {
      // 'priority' (default): priority desc → due_at asc → created_at asc
      query = query
        .order('priority', { ascending: false })
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Apply title search client-side (PostgREST nested ILIKE is unreliable)
  let rows = data || [];
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    rows = rows.filter((j: Record<string, unknown>) => {
      const title = ((j.mp_scripts as Record<string, unknown>)?.title as string) || '';
      return title.toLowerCase().includes(term);
    });
  }

  // Billing-safe guard: exclude jobs from clients with inactive plans
  // VAs should not see/claim jobs from clients who haven't paid
  rows = rows.filter((j: Record<string, unknown>) => {
    const planData = j.client_plans as Record<string, unknown> | null;
    return isPlanBillable((planData?.status as string) || null);
  });

  const mapped = rows.map((j: Record<string, unknown>) => {
    const scriptData = j.mp_scripts as Record<string, unknown> | null;
    const assets = (scriptData && Array.isArray(scriptData.script_assets))
      ? scriptData.script_assets as { asset_type: string }[]
      : [];
    const brollLinks = (scriptData && Array.isArray(scriptData.script_broll_links))
      ? scriptData.script_broll_links as unknown[]
      : [];
    const deliverables = Array.isArray(j.job_deliverables) ? j.job_deliverables : [];
    const planData = j.client_plans as Record<string, unknown> | null;
    const tier = (planData?.plan_tier as PlanTier) || 'pool_15';
    const slaHours = (planData?.sla_hours as number) || PLAN_TIER_DEFAULTS[tier].sla_hours;
    const sla = computeSlaFields(j.due_at as string | null);

    // Compute effective priority with decay for queued jobs
    const jobStatus = j.job_status as string;
    const storedPriority = j.priority as number;
    let effectivePriority = storedPriority;
    if (jobStatus === 'queued') {
      const decayResult = computePriorityWeight({
        plan_tier: tier as PlanTier,
        job_status: jobStatus,
        created_at: j.created_at as string,
        current_priority: storedPriority,
      });
      effectivePriority = decayResult.priority_weight;
    }

    return {
      id: j.id as string,
      script_id: j.script_id as string,
      client_id: j.client_id as string,
      job_status: jobStatus as JobStatus,
      priority: storedPriority,
      effective_priority: effectivePriority,
      claimed_by: j.claimed_by as string | null,
      due_at: j.due_at as string | null,
      created_at: j.created_at as string,
      // VA-safe fields — never includes client name or email
      client_code: (j.clients as Record<string, string>)?.client_code || 'Unknown',
      plan_tier: planTierLabel(tier),
      sla_hours: slaHours,
      is_overdue: sla.is_overdue,
      due_in_hours: sla.due_in_hours,
      sla_breach_at: sla.sla_breach_at,
      is_sla_breached: sla.is_sla_breached,
      script_title: (scriptData?.title as string) || 'Untitled',
      script_notes: (scriptData?.notes as string) || '',
      broll_suggestions: (scriptData?.broll_suggestions as string) || '',
      has_raw_footage: assets.some(a => a.asset_type === 'raw_folder' || a.asset_type === 'raw_video'),
      has_broll_pack: brollLinks.length > 0,
      revision_count: deliverables.length,
    };
  });

  // Re-sort in-memory by effective_priority when using priority sort mode,
  // so that 48h priority decay is reflected in queue ordering.
  const sort = filters?.sort || 'priority';
  if (sort === 'priority' && statusFilter !== 'mine') {
    mapped.sort((a, b) => {
      // effective_priority DESC
      if (b.effective_priority !== a.effective_priority) return b.effective_priority - a.effective_priority;
      // due_at ASC (nulls last)
      if (a.due_at && b.due_at) {
        const diff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        if (diff !== 0) return diff;
      } else if (a.due_at && !b.due_at) return -1;
      else if (!a.due_at && b.due_at) return 1;
      // created_at ASC (FIFO tiebreak)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  return mapped;
}

export async function getJobDetail(jobId: string): Promise<JobWithScript | null> {
  const sb = supabaseAdmin;

  const [jobRes, feedbackRes, delivRes, eventsRes] = await Promise.all([
    sb.from('edit_jobs').select(`
      *,
      mp_scripts:mp_scripts!edit_jobs_script_id_fkey(*),
      clients:clients!edit_jobs_client_id_fkey(client_code),
      client_plans:client_plans!edit_jobs_client_id_fkey(plan_tier, sla_hours)
    `).eq('id', jobId).single(),
    sb.from('job_feedback').select('*').eq('job_id', jobId).order('created_at'),
    sb.from('job_deliverables').select('*').eq('job_id', jobId).order('created_at'),
    sb.from('job_events').select('*').eq('job_id', jobId).order('created_at'),
  ]);

  if (!jobRes.data) return null;
  const job = jobRes.data;

  // Touch heartbeat if job is actively being worked on
  if (['claimed', 'in_progress', 'changes_requested'].includes(job.job_status)) {
    touchHeartbeat(jobId); // fire-and-forget
  }

  const script = job.mp_scripts as unknown as MpScript;
  const clientCode = (job.clients as Record<string, string>)?.client_code || '';
  const planData = job.client_plans as Record<string, unknown> | null;
  const tier = (planData?.plan_tier as PlanTier) || 'pool_15';
  const slaHours = (planData?.sla_hours as number) || PLAN_TIER_DEFAULTS[tier].sla_hours;
  const sla = computeSlaFields(job.due_at);

  // Get script assets + generate signed URLs for raw footage
  const { data: rawAssets } = await sb.from('script_assets').select('*').eq('script_id', script.id);
  const assets = await Promise.all(
    (rawAssets || []).map(async (a: Record<string, unknown>) => {
      if (['raw_folder', 'raw_video'].includes(a.asset_type as string) && a.url && !(a.url as string).startsWith('http')) {
        const { data: urlData } = await sb.storage
          .from('raw-footage')
          .createSignedUrl(a.url as string, 3600);
        return { ...a, signed_url: urlData?.signedUrl || null };
      }
      return { ...a, signed_url: (a.url as string) || null };
    })
  );

  // Get broll links with signed URLs
  const { data: brollLinks } = await sb
    .from('script_broll_links')
    .select('*, broll_assets:broll_assets!script_broll_links_broll_asset_id_fkey(*)')
    .eq('script_id', script.id);

  const brollLinksWithUrls = await Promise.all(
    (brollLinks || []).map(async (bl: Record<string, unknown>) => {
      const asset = bl.broll_assets as Record<string, unknown> | null;
      let signedUrl: string | null = null;
      if (asset?.storage_bucket && asset?.storage_path) {
        const { data: urlData } = await sb.storage
          .from(asset.storage_bucket as string)
          .createSignedUrl(asset.storage_path as string, 3600);
        signedUrl = urlData?.signedUrl || null;
      }
      return {
        script_id: bl.script_id as string,
        broll_asset_id: bl.broll_asset_id as string,
        recommended_for: bl.recommended_for as string | null,
        notes: bl.notes as string | null,
        created_at: bl.created_at as string,
        signed_url: signedUrl,
        asset: bl.broll_assets as unknown as BrollAsset,
      };
    })
  );

  return {
    ...job,
    script,
    client_code: clientCode,
    plan_tier: planTierLabel(tier),
    sla_hours: slaHours,
    is_overdue: sla.is_overdue,
    due_in_hours: sla.due_in_hours,
    sla_breach_at: sla.sla_breach_at,
    is_sla_breached: sla.is_sla_breached,
    assets: assets as (ScriptAsset & { signed_url: string | null })[],
    deliverables: (delivRes.data || []) as JobDeliverable[],
    feedback: (feedbackRes.data || []) as JobFeedback[],
    events: (eventsRes.data || []) as JobEvent[],
    broll_links: brollLinksWithUrls,
  } as JobWithScript;
}

// ============================================================
// VA job actions
// ============================================================

export async function claimJob(jobId: string, userId: string) {
  const sb = supabaseAdmin;

  // Validate transition before atomic claim
  const { data: current } = await sb.from('edit_jobs').select('job_status, due_at').eq('id', jobId).single();
  if (!current) throw new MarketplaceError('Job not found', 'NOT_FOUND', 404);

  // Check for terminal/inactive states with specific error code
  const terminalStatuses: JobStatus[] = ['posted', 'canceled', 'approved'];
  if (terminalStatuses.includes(current.job_status as JobStatus)) {
    throw new MarketplaceError('Job is no longer active', 'JOB_NOT_ACTIVE', 410);
  }

  validateTransition(current.job_status as JobStatus, 'claimed');

  // Atomic claim: only if still queued and unclaimed
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'claimed', claimed_by: userId, claimed_at: now, last_heartbeat_at: now })
    .eq('id', jobId)
    .eq('job_status', 'queued')
    .is('claimed_by', null)
    .select()
    .single();

  if (error || !data) throw new MarketplaceError('Job already claimed or not available', 'JOB_ALREADY_CLAIMED', 409);

  // Update script status
  await sb.from('mp_scripts').update({ status: 'editing' }).eq('id', data.script_id);

  // Event
  await sb.from('job_events').insert({ job_id: jobId, event_type: 'claimed', actor_user_id: userId });
  return data as EditJob;
}

export async function startJob(jobId: string, userId: string) {
  const sb = await createServerSupabaseClient();

  // Fetch current state for validation
  const { data: current } = await sb.from('edit_jobs').select('job_status, claimed_by').eq('id', jobId).single();
  if (!current) throw new MarketplaceError('Job not found', 'NOT_FOUND', 404);
  if (current.claimed_by !== userId) throw new MarketplaceError('Not your job', 'NOT_OWNER', 403);
  validateTransition(current.job_status as JobStatus, 'in_progress');

  const startNow = new Date().toISOString();
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'in_progress', started_at: startNow, last_heartbeat_at: startNow, stalled_at: null })
    .eq('id', jobId)
    .eq('claimed_by', userId)
    .in('job_status', ['claimed', 'changes_requested'])
    .select()
    .single();
  if (error || !data) throw new MarketplaceError('Cannot start job', 'TRANSITION_FAILED', 409);

  // Update script status
  await sb.from('mp_scripts').update({ status: 'editing' }).eq('id', data.script_id);

  await sb.from('job_events').insert({ job_id: jobId, event_type: 'started', actor_user_id: userId });
  return data as EditJob;
}

export async function submitJob(
  jobId: string,
  userId: string,
  deliverableUrl: string,
  label?: string,
  deliverableType: 'main' | 'variant' = 'main',
) {
  const sb = await createServerSupabaseClient();

  // Validate current state
  const { data: current } = await sb.from('edit_jobs').select('job_status, claimed_by').eq('id', jobId).single();
  if (!current) throw new MarketplaceError('Job not found', 'NOT_FOUND', 404);
  if (current.claimed_by !== userId) throw new MarketplaceError('Not your job', 'NOT_OWNER', 403);
  validateTransition(current.job_status as JobStatus, 'submitted');

  // Compute next version number (append-only — never overwrites)
  const { count: existingCount } = await sb
    .from('job_deliverables')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId);
  const nextVersion = (existingCount ?? 0) + 1;

  // Add deliverable
  await sb.from('job_deliverables').insert({
    job_id: jobId,
    deliverable_type: deliverableType,
    version: nextVersion,
    label: label || (deliverableType === 'variant' ? 'Variant' : `Final Edit v${nextVersion}`),
    url: deliverableUrl,
    created_by: userId,
  });

  // Update job
  const submitNow = new Date().toISOString();
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'submitted', submitted_at: submitNow, last_heartbeat_at: submitNow })
    .eq('id', jobId)
    .eq('claimed_by', userId)
    .in('job_status', ['in_progress', 'changes_requested'])
    .select()
    .single();
  if (error || !data) throw new MarketplaceError('Cannot submit job', 'TRANSITION_FAILED', 409);

  // Update script
  await sb.from('mp_scripts').update({ status: 'in_review' }).eq('id', data.script_id);

  await sb.from('job_events').insert({ job_id: jobId, event_type: 'submitted', actor_user_id: userId });
  return data as EditJob;
}

// ============================================================
// Client review actions
// ============================================================

export async function approveJob(jobId: string, userId: string) {
  const sb = await createServerSupabaseClient();

  const { data: current } = await sb.from('edit_jobs').select('job_status').eq('id', jobId).single();
  if (!current) throw new MarketplaceError('Job not found', 'NOT_FOUND', 404);
  validateTransition(current.job_status as JobStatus, 'approved');

  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('job_status', 'submitted')
    .select()
    .single();
  if (error || !data) throw new MarketplaceError('Cannot approve job', 'TRANSITION_FAILED', 409);
  await sb.from('mp_scripts').update({ status: 'approved' }).eq('id', data.script_id);
  await sb.from('job_events').insert({ job_id: jobId, event_type: 'approved', actor_user_id: userId });
  return data as EditJob;
}

export async function requestChanges(jobId: string, userId: string, message: string) {
  const sb = await createServerSupabaseClient();

  const { data: current } = await sb.from('edit_jobs').select('job_status').eq('id', jobId).single();
  if (!current) throw new MarketplaceError('Job not found', 'NOT_FOUND', 404);
  validateTransition(current.job_status as JobStatus, 'changes_requested');

  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'changes_requested' })
    .eq('id', jobId)
    .eq('job_status', 'submitted')
    .select()
    .single();
  if (error || !data) throw new MarketplaceError('Cannot request changes', 'TRANSITION_FAILED', 409);
  await sb.from('mp_scripts').update({ status: 'changes_requested' }).eq('id', data.script_id);
  await sb.from('job_feedback').insert({
    job_id: jobId,
    author_user_id: userId,
    author_role: 'client',
    message,
  });
  await sb.from('job_events').insert({
    job_id: jobId,
    event_type: 'changes_requested',
    actor_user_id: userId,
    payload: { message },
  });
  return data as EditJob;
}

export async function markPosted(scriptId: string, userId: string) {
  const sb = await createServerSupabaseClient();

  const { data: job } = await sb.from('edit_jobs').select('id, job_status').eq('script_id', scriptId).single();
  if (job) {
    validateTransition(job.job_status as JobStatus, 'posted');
    await sb.from('edit_jobs')
      .update({ job_status: 'posted', posted_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('job_status', 'approved');
    await sb.from('job_events').insert({ job_id: job.id, event_type: 'posted', actor_user_id: userId });
  }

  await sb.from('mp_scripts').update({ status: 'posted' }).eq('id', scriptId);
}

// ============================================================
// Metrics
// ============================================================

export async function getClientMetrics(clientId: string): Promise<MetricsSummary> {
  const sb = await createServerSupabaseClient();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  // Get all completed jobs for this client
  const { data: jobs } = await sb
    .from('edit_jobs')
    .select('created_at, claimed_at, started_at, submitted_at, approved_at, due_at, job_status')
    .eq('client_id', clientId);

  const allJobs = jobs || [];
  const approved = allJobs.filter(j => j.approved_at);

  function avgTurnaround(since: string) {
    const relevant = approved.filter(j => j.approved_at! >= since && j.created_at);
    if (relevant.length === 0) return null;
    const total = relevant.reduce((sum, j) => {
      return sum + (new Date(j.approved_at!).getTime() - new Date(j.created_at).getTime());
    }, 0);
    return Math.round(total / relevant.length / 3_600_000 * 10) / 10; // hours
  }

  function onTimeRate(since: string) {
    const relevant = approved.filter(j => j.approved_at! >= since && j.due_at);
    if (relevant.length === 0) return null;
    const onTime = relevant.filter(j => j.approved_at! <= j.due_at!).length;
    return Math.round(onTime / relevant.length * 100);
  }

  // Queue wait: time from created_at to claimed_at
  function avgPhase(phase: 'queue_wait' | 'edit_time' | 'review_time') {
    const relevant = approved.filter(j => j.approved_at! >= d30);
    if (relevant.length === 0) return null;
    let total = 0;
    let count = 0;
    for (const j of relevant) {
      let start: string | null = null;
      let end: string | null = null;
      if (phase === 'queue_wait') { start = j.created_at; end = j.claimed_at; }
      else if (phase === 'edit_time') { start = j.started_at || j.claimed_at; end = j.submitted_at; }
      else if (phase === 'review_time') { start = j.submitted_at; end = j.approved_at; }
      if (start && end) {
        total += new Date(end).getTime() - new Date(start).getTime();
        count++;
      }
    }
    return count > 0 ? Math.round(total / count / 3_600_000 * 10) / 10 : null;
  }

  // Oldest job in queue
  const queued = allJobs.filter(j => j.job_status === 'queued');
  let oldestInQueueHours: number | null = null;
  if (queued.length > 0) {
    const oldest = queued.reduce((a, b) => a.created_at < b.created_at ? a : b);
    oldestInQueueHours = Math.round((now.getTime() - new Date(oldest.created_at).getTime()) / 3_600_000 * 10) / 10;
  }

  return {
    avg_turnaround_7d: avgTurnaround(d7),
    avg_turnaround_30d: avgTurnaround(d30),
    on_time_rate_7d: onTimeRate(d7),
    on_time_rate_30d: onTimeRate(d30),
    queue_count: queued.length,
    in_progress_count: allJobs.filter(j => ['claimed', 'in_progress'].includes(j.job_status)).length,
    completed_7d: approved.filter(j => j.approved_at! >= d7).length,
    completed_30d: approved.filter(j => j.approved_at! >= d30).length,
    avg_queue_wait_hours: avgPhase('queue_wait'),
    avg_edit_time_hours: avgPhase('edit_time'),
    avg_review_time_hours: avgPhase('review_time'),
    oldest_in_queue_hours: oldestInQueueHours,
  };
}

// ============================================================
// VA feedback
// ============================================================

export async function addFeedback(jobId: string, userId: string, role: FeedbackRole, message: string) {
  const sb = await createServerSupabaseClient();
  const { data, error } = await sb.from('job_feedback').insert({
    job_id: jobId,
    author_user_id: userId,
    author_role: role,
    message,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as JobFeedback;
}

// ============================================================
// B-roll helpers
// ============================================================

export async function getBrollForScript(scriptId: string) {
  const sb = await createServerSupabaseClient();
  const { data } = await sb
    .from('script_broll_links')
    .select('*, broll_assets:broll_assets!script_broll_links_broll_asset_id_fkey(*)')
    .eq('script_id', scriptId);
  return (data || []).map((bl: Record<string, unknown>) => ({
    ...bl,
    asset: bl.broll_assets as unknown as BrollAsset,
  }));
}

export async function createBrollAsset(data: {
  hash: string;
  source_type: string;
  client_code: string;
  script_id: string | null;
  storage_bucket: string;
  storage_path: string;
  tags?: string[];
  prompt?: string;
  duration_seconds?: number;
}) {
  const svc = supabaseAdmin;
  // Dedupe by hash
  const { data: existing } = await svc.from('broll_assets').select('id').eq('hash', data.hash).single();
  if (existing) return existing.id as string;

  const { data: asset, error } = await svc.from('broll_assets').insert({
    hash: data.hash,
    source_type: data.source_type,
    client_code: data.client_code,
    script_id: data.script_id,
    storage_bucket: data.storage_bucket,
    storage_path: data.storage_path,
    tags: data.tags || [],
    prompt: data.prompt || null,
    duration_seconds: data.duration_seconds || null,
  }).select().single();
  if (error) throw new Error(error.message);
  return asset.id as string;
}

export async function linkBrollToScript(scriptId: string, brollAssetId: string, recommendedFor?: string, notes?: string) {
  const svc = supabaseAdmin;
  await svc.from('script_broll_links').upsert({
    script_id: scriptId,
    broll_asset_id: brollAssetId,
    recommended_for: recommendedFor || null,
    notes: notes || null,
  }, { onConflict: 'script_id,broll_asset_id' });
}

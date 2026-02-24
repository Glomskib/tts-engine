// ============================================================
// Marketplace Supabase query helpers (server-side)
// ============================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  MpScript, EditJob, ScriptAsset, JobFeedback, JobDeliverable,
  JobEvent, BrollAsset, ScriptBrollLink, PipelineRow, MetricsSummary,
  JobWithScript, ScriptStatus, JobStatus, FeedbackRole,
} from './types';
import { getNextAction } from './types';

// Service-role client for internal operations (bypasses RLS)
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

  // Get plan
  const { data: plan } = await svc.from('client_plans').select('*').eq('client_id', clientId).single();
  const slaHours = plan?.sla_hours || 48;
  const dailyCap = plan?.daily_cap || 15;

  // Check daily cap
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await svc.from('plan_usage_daily')
    .select('submitted_count')
    .eq('client_id', clientId)
    .eq('date', today)
    .single();

  const currentCount = usage?.submitted_count || 0;
  if (currentCount >= dailyCap) {
    throw new Error(`Daily cap reached (${dailyCap}). Try again tomorrow.`);
  }

  // Upsert usage
  await svc.from('plan_usage_daily').upsert({
    client_id: clientId,
    date: today,
    submitted_count: currentCount + 1,
  }, { onConflict: 'client_id,date' });

  // Update script status
  await svc.from('mp_scripts').update({ status: 'queued' }).eq('id', scriptId);

  // Create edit job if not exists
  const dueAt = new Date(Date.now() + slaHours * 3600_000).toISOString();
  const { data: existingJob } = await svc.from('edit_jobs').select('id').eq('script_id', scriptId).single();

  let jobId: string;
  if (existingJob) {
    await svc.from('edit_jobs').update({
      job_status: 'queued',
      due_at: dueAt,
    }).eq('id', existingJob.id);
    jobId = existingJob.id;
  } else {
    const { data: newJob, error } = await svc.from('edit_jobs').insert({
      script_id: scriptId,
      client_id: clientId,
      job_status: 'queued',
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

  return jobId;
}

// ============================================================
// VA job board
// ============================================================

export async function getQueuedJobs(filters?: { sort?: 'newest' | 'due_soon' | 'priority' }) {
  const sb = await createServerSupabaseClient();

  let query = sb
    .from('edit_jobs')
    .select(`
      id, script_id, client_id, job_status, priority, claimed_by, due_at, created_at,
      mp_scripts:mp_scripts!edit_jobs_script_id_fkey(title, notes, broll_suggestions),
      clients:clients!edit_jobs_client_id_fkey(client_code)
    `)
    .in('job_status', ['queued', 'claimed', 'in_progress', 'submitted', 'changes_requested']);

  const sort = filters?.sort || 'newest';
  if (sort === 'due_soon') {
    query = query.order('due_at', { ascending: true, nullsFirst: false });
  } else if (sort === 'priority') {
    query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((j: Record<string, unknown>) => ({
    ...j,
    client_code: (j.clients as Record<string, string>)?.client_code || 'Unknown',
    script_title: (j.mp_scripts as Record<string, string>)?.title || 'Untitled',
    script_notes: (j.mp_scripts as Record<string, string>)?.notes || '',
    broll_suggestions: (j.mp_scripts as Record<string, string>)?.broll_suggestions || '',
  }));
}

export async function getJobDetail(jobId: string): Promise<JobWithScript | null> {
  const sb = await createServerSupabaseClient();

  const [jobRes, feedbackRes, delivRes, eventsRes] = await Promise.all([
    sb.from('edit_jobs').select(`
      *,
      mp_scripts:mp_scripts!edit_jobs_script_id_fkey(*),
      clients:clients!edit_jobs_client_id_fkey(client_code)
    `).eq('id', jobId).single(),
    sb.from('job_feedback').select('*').eq('job_id', jobId).order('created_at'),
    sb.from('job_deliverables').select('*').eq('job_id', jobId).order('created_at'),
    sb.from('job_events').select('*').eq('job_id', jobId).order('created_at'),
  ]);

  if (!jobRes.data) return null;
  const job = jobRes.data;
  const script = job.mp_scripts as unknown as MpScript;
  const clientCode = (job.clients as Record<string, string>)?.client_code || '';

  // Get script assets
  const { data: assets } = await sb.from('script_assets').select('*').eq('script_id', script.id);

  // Get broll links
  const { data: brollLinks } = await sb
    .from('script_broll_links')
    .select('*, broll_assets:broll_assets!script_broll_links_broll_asset_id_fkey(*)')
    .eq('script_id', script.id);

  return {
    ...job,
    script,
    client_code: clientCode,
    assets: (assets || []) as ScriptAsset[],
    deliverables: (delivRes.data || []) as JobDeliverable[],
    feedback: (feedbackRes.data || []) as JobFeedback[],
    broll_links: (brollLinks || []).map((bl: Record<string, unknown>) => ({
      script_id: bl.script_id as string,
      broll_asset_id: bl.broll_asset_id as string,
      recommended_for: bl.recommended_for as string | null,
      notes: bl.notes as string | null,
      created_at: bl.created_at as string,
      asset: bl.broll_assets as unknown as BrollAsset,
    })),
  } as JobWithScript;
}

// ============================================================
// VA job actions
// ============================================================

export async function claimJob(jobId: string, userId: string) {
  const sb = await createServerSupabaseClient();
  // Atomic claim: only if still queued and unclaimed
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'claimed', claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('job_status', 'queued')
    .is('claimed_by', null)
    .select()
    .single();

  if (error || !data) throw new Error('Job already claimed or not available');

  // Update script status
  await sb.from('mp_scripts').update({ status: 'editing' }).eq('id', data.script_id);

  // Event
  await sb.from('job_events').insert({ job_id: jobId, event_type: 'claimed', actor_user_id: userId });
  return data as EditJob;
}

export async function startJob(jobId: string, userId: string) {
  const sb = await createServerSupabaseClient();
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('claimed_by', userId)
    .select()
    .single();
  if (error || !data) throw new Error('Cannot start job');
  await sb.from('job_events').insert({ job_id: jobId, event_type: 'started', actor_user_id: userId });
  return data as EditJob;
}

export async function submitJob(jobId: string, userId: string, deliverableUrl: string, label?: string) {
  const sb = await createServerSupabaseClient();

  // Add deliverable
  await sb.from('job_deliverables').insert({
    job_id: jobId,
    deliverable_type: 'main',
    label: label || 'Final Edit',
    url: deliverableUrl,
    created_by: userId,
  });

  // Update job
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('claimed_by', userId)
    .select()
    .single();
  if (error || !data) throw new Error('Cannot submit job');

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
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', jobId)
    .select()
    .single();
  if (error || !data) throw new Error('Cannot approve job');
  await sb.from('mp_scripts').update({ status: 'approved' }).eq('id', data.script_id);
  await sb.from('job_events').insert({ job_id: jobId, event_type: 'approved', actor_user_id: userId });
  return data as EditJob;
}

export async function requestChanges(jobId: string, userId: string, message: string) {
  const sb = await createServerSupabaseClient();
  const { data, error } = await sb
    .from('edit_jobs')
    .update({ job_status: 'changes_requested' })
    .eq('id', jobId)
    .select()
    .single();
  if (error || !data) throw new Error('Cannot request changes');
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
  await sb.from('mp_scripts').update({ status: 'posted' }).eq('id', scriptId);

  const { data: job } = await sb.from('edit_jobs').select('id').eq('script_id', scriptId).single();
  if (job) {
    await sb.from('edit_jobs').update({ job_status: 'posted', posted_at: new Date().toISOString() }).eq('id', job.id);
    await sb.from('job_events').insert({ job_id: job.id, event_type: 'posted', actor_user_id: userId });
  }
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

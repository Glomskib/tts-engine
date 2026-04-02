/**
 * FlashFlow Footage Hub — Service Layer
 *
 * All database operations for footage_items go through here.
 * Never query footage_items directly from API routes — use this service.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { canTransitionFootage } from './constants';
import type {
  FootageItem,
  FootageItemWithRelations,
  FootageEvent,
  CreateFootageItemInput,
  UpdateFootageItemInput,
  FootageListParams,
  FootageListResponse,
} from './types';
import type { FootageStage } from './constants';

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createFootageItem(input: CreateFootageItemInput): Promise<FootageItem> {
  // Dedup check: if content_hash + workspace_id already exists, return existing
  if (input.content_hash && input.workspace_id) {
    const { data: existing } = await supabaseAdmin
      .from('footage_items')
      .select('*')
      .eq('workspace_id', input.workspace_id)
      .eq('content_hash', input.content_hash)
      .is('deleted_at', null)
      .single();
    if (existing) return existing as FootageItem;
  }

  const { data, error } = await supabaseAdmin
    .from('footage_items')
    .insert({
      workspace_id:     input.workspace_id,
      created_by:       input.created_by || null,
      original_filename: input.original_filename,
      content_hash:     input.content_hash || null,
      storage_path:     input.storage_path || null,
      storage_url:      input.storage_url || null,
      thumbnail_url:    input.thumbnail_url || null,
      byte_size:        input.byte_size || null,
      duration_sec:     input.duration_sec || null,
      resolution:       input.resolution || null,
      codec:            input.codec || null,
      mime_type:        input.mime_type || 'video/mp4',
      source_type:      input.source_type,
      source_ref_id:    input.source_ref_id || null,
      uploaded_by:      input.uploaded_by || 'user',
      content_item_id:  input.content_item_id || null,
      render_job_id:    input.render_job_id || null,
      auto_edit_eligible: input.auto_edit_eligible ?? false,
      parent_footage_id: input.parent_footage_id || null,
      version_num:      input.version_num ?? 1,
      stage:            'raw_uploaded',
      metadata:         input.metadata || {},
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to create footage item');

  await logFootageEvent(data.id, 'upload', null, 'raw_uploaded', input.uploaded_by || 'user', {
    source_type: input.source_type,
    filename: input.original_filename,
    byte_size: input.byte_size,
  });

  return data as FootageItem;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getFootageItem(id: string): Promise<FootageItemWithRelations | null> {
  const { data, error } = await supabaseAdmin
    .from('footage_items')
    .select(`
      *,
      content_item:content_item_id (id, title, status, short_id),
      render_job:render_job_id (id, status, progress_pct, progress_message, node_id),
      parent_footage:parent_footage_id (id, original_filename, stage, storage_url)
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;

  // Get versions (other items with same parent or that are children)
  const { data: versions } = await supabaseAdmin
    .from('footage_items')
    .select('id, original_filename, stage, storage_url, version_num, created_at')
    .eq('parent_footage_id', data.parent_footage_id || data.id)
    .is('deleted_at', null)
    .order('version_num', { ascending: true });

  // Get events
  const { data: events } = await supabaseAdmin
    .from('footage_events')
    .select('*')
    .eq('footage_item_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    ...(data as unknown as FootageItem),
    versions: (versions || []) as any,
    events: (events || []) as FootageEvent[],
  };
}

export async function listFootageItems(params: FootageListParams): Promise<FootageListResponse> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  let query = supabaseAdmin
    .from('footage_items')
    .select('*', { count: 'exact' });

  if (!params.include_deleted) {
    query = query.is('deleted_at', null);
  }

  if (params.workspace_id && !params.admin) {
    query = query.eq('workspace_id', params.workspace_id);
  }

  if (params.stage) {
    if (Array.isArray(params.stage)) {
      query = query.in('stage', params.stage);
    } else {
      query = query.eq('stage', params.stage);
    }
  }

  if (params.source_type) {
    query = query.eq('source_type', params.source_type);
  }

  if (params.uploaded_by) {
    query = query.eq('uploaded_by', params.uploaded_by);
  }

  if (params.content_item_id) {
    query = query.eq('content_item_id', params.content_item_id);
  }

  if (params.search) {
    query = query.ilike('original_filename', `%${params.search}%`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return {
    items: (data || []) as FootageItem[],
    total: count ?? 0,
    has_more: (count ?? 0) > offset + limit,
  };
}

// ─── Update / Stage Transitions ───────────────────────────────────────────────

export async function updateFootageItem(id: string, input: UpdateFootageItemInput, actor = 'system'): Promise<FootageItem> {
  const { stage: newStage, ...rest } = input;

  // Validate stage transition if changing stage
  if (newStage) {
    const { data: current } = await supabaseAdmin
      .from('footage_items')
      .select('stage')
      .eq('id', id)
      .single();

    if (current && !canTransitionFootage(current.stage as FootageStage, newStage)) {
      throw new Error(`Invalid stage transition: ${current.stage} → ${newStage}`);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('footage_items')
    .update({ ...(newStage ? { stage: newStage } : {}), ...rest })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Update failed');

  if (newStage) {
    await logFootageEvent(id, 'stage_change', (data as any).stage, newStage, actor, {});
  }

  return data as FootageItem;
}

export async function advanceFootageStage(
  id: string,
  toStage: FootageStage,
  actor = 'system',
  details: Record<string, unknown> = {}
): Promise<FootageItem> {
  return updateFootageItem(id, { stage: toStage }, actor);
}

// ─── Auto-edit ────────────────────────────────────────────────────────────────

export async function queueAutoEdit(
  footageId: string,
  userId: string,
  options: { product_id?: string; context?: string } = {}
): Promise<{ render_job_id: string }> {
  const { data: footage } = await supabaseAdmin
    .from('footage_items')
    .select('*')
    .eq('id', footageId)
    .single();

  if (!footage) throw new Error('Footage item not found');
  if (!footage.auto_edit_eligible) throw new Error('Auto-edit not enabled for this account');
  if (!footage.storage_url) throw new Error('No storage URL — upload not complete');

  // Create render job
  const { data: job, error: jobError } = await supabaseAdmin
    .from('render_jobs')
    .insert({
      workspace_id:    footage.workspace_id,
      content_item_id: footage.content_item_id || null,
      footage_item_id: footageId,
      job_type:        'clip_render',
      status:          'queued',
      priority:        5,
      payload: {
        clip_urls:  [footage.storage_url],
        product_id: options.product_id || null,
        context:    options.context || null,
        settings:   { burn_subtitles: true },
      },
    })
    .select('id')
    .single();

  if (jobError || !job) throw new Error(jobError?.message || 'Failed to create render job');

  // Link render job + advance stage
  await supabaseAdmin
    .from('footage_items')
    .update({
      render_job_id:           job.id,
      stage:                   'auto_edit_queued',
      auto_edit_requested_at:  new Date().toISOString(),
    })
    .eq('id', footageId);

  await logFootageEvent(footageId, 'auto_edit_queued', 'ready_for_edit', 'auto_edit_queued', userId, {
    render_job_id: job.id,
  });

  return { render_job_id: job.id };
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export async function deleteFootageItem(id: string, actor = 'user'): Promise<void> {
  await supabaseAdmin
    .from('footage_items')
    .update({ deleted_at: new Date().toISOString(), stage: 'archived' })
    .eq('id', id);

  await logFootageEvent(id, 'deleted', null, 'archived', actor, {});
}

// ─── Event logging ────────────────────────────────────────────────────────────

export async function logFootageEvent(
  footageItemId: string,
  eventType: string,
  fromStage: FootageStage | null | string,
  toStage: FootageStage | null | string,
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  await supabaseAdmin
    .from('footage_events')
    .insert({
      footage_item_id: footageItemId,
      event_type:      eventType,
      from_stage:      fromStage || null,
      to_stage:        toStage || null,
      actor,
      details,
    })
    .then(() => {}); // non-fatal
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getFootageByContentItem(contentItemId: string): Promise<FootageItem[]> {
  const { data } = await supabaseAdmin
    .from('footage_items')
    .select('*')
    .eq('content_item_id', contentItemId)
    .is('deleted_at', null)
    .order('version_num', { ascending: true });
  return (data || []) as FootageItem[];
}

export async function getFootageByRenderJob(renderJobId: string): Promise<FootageItem[]> {
  const { data } = await supabaseAdmin
    .from('footage_items')
    .select('*')
    .eq('render_job_id', renderJobId)
    .is('deleted_at', null);
  return (data || []) as FootageItem[];
}

/** Check if workspace has auto-edit enabled (reads from workspace/plan settings) */
export async function isAutoEditEligible(workspaceId: string): Promise<boolean> {
  // Check plan entitlement — any plan with render access gets auto-edit
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', workspaceId)
    .single();

  const eligibleRoles = ['admin', 'creator_pro', 'agency', 'brand'];
  return eligibleRoles.includes(data?.role || '');
}

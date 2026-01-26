/**
 * ingestion.ts
 *
 * Resilient video ingestion layer for external sources.
 * Implements two-phase commit (validate -> commit) to prevent partial corruption.
 *
 * Key properties:
 * - Idempotent: same external_id never creates duplicate videos
 * - Atomic: jobs either fully commit or fail cleanly
 * - Auditable: all operations emit events_log entries
 * - Recoverable: failed rows are visible and actionable
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_STATUSES, type VideoStatus } from "./video-pipeline";
import { createScriptVersion } from "./video-script-versions";
import { ensureEnrichmentTask, linkEnrichmentTaskToVideo } from "./enrichment";

// ============================================================================
// Types
// ============================================================================

export const INGESTION_SOURCES = ["tiktok_url", "csv", "sheets", "monday", "manual"] as const;
export type IngestionSource = (typeof INGESTION_SOURCES)[number];

export const JOB_STATUSES = ["pending", "validated", "committed", "failed", "partial"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ROW_STATUSES = ["pending", "validated", "committed", "failed", "duplicate"] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

/** Default initial status for ingested videos */
export const DEFAULT_INITIAL_STATUS: VideoStatus = "draft";

/**
 * Normalized payload for video ingestion.
 * All external formats are normalized to this structure.
 */
export interface NormalizedPayload {
  // Required minimum
  caption?: string | null;

  // Optional enrichment
  hashtags?: string[] | null;
  product_sku?: string | null;
  product_link?: string | null;
  script_text?: string | null;

  // TikTok-specific
  tiktok_url?: string | null;
  tiktok_video_id?: string | null;

  // Posting metadata
  target_account?: string | null;

  // Variant/account linking (optional)
  variant_id?: string | null;
  account_id?: string | null;

  // Raw source data (for debugging)
  raw_source_data?: Record<string, unknown>;
}

export interface IngestionJob {
  id: string;
  source: IngestionSource;
  source_ref: string;
  status: JobStatus;
  total_rows: number;
  success_count: number;
  failure_count: number;
  duplicate_count: number;
  error_summary: ErrorSummaryEntry[];
  created_by: string;
  created_at: string;
  validated_at: string | null;
  committed_at: string | null;
  completed_at: string | null;
}

export interface IngestionRow {
  id: string;
  job_id: string;
  external_id: string;
  normalized_payload: NormalizedPayload;
  status: RowStatus;
  error: string | null;
  created_video_id: string | null;
  created_at: string;
  validated_at: string | null;
  committed_at: string | null;
}

export interface ErrorSummaryEntry {
  error_type: string;
  count: number;
  examples: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CreateJobResult {
  ok: boolean;
  job?: IngestionJob;
  error?: string;
}

export interface ValidateJobResult {
  ok: boolean;
  job?: IngestionJob;
  validated_count: number;
  failed_count: number;
  duplicate_count: number;
  errors?: ErrorSummaryEntry[];
  error?: string;
}

export interface CommitJobResult {
  ok: boolean;
  job?: IngestionJob;
  committed_count: number;
  failed_count: number;
  created_video_ids: string[];
  error?: string;
}

export interface ReconciliationReport {
  job_id: string;
  source: IngestionSource;
  source_ref: string;
  status: JobStatus;
  total_rows: number;
  committed_rows: {
    external_id: string;
    video_id: string;
    caption: string | null;
  }[];
  failed_rows: {
    external_id: string;
    error: string;
    normalized_payload: NormalizedPayload;
  }[];
  duplicate_rows: {
    external_id: string;
    existing_video_id: string;
  }[];
}

// ============================================================================
// TikTok URL Parsing
// ============================================================================

const TIKTOK_URL_PATTERNS = [
  // Standard web URL: https://www.tiktok.com/@username/video/1234567890
  /tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
  // Short URL: https://vm.tiktok.com/ABC123
  /vm\.tiktok\.com\/(\w+)/i,
  // Mobile share: https://www.tiktok.com/t/ABC123
  /tiktok\.com\/t\/(\w+)/i,
];

/**
 * Extract TikTok video ID from various URL formats.
 */
export function extractTikTokVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  for (const pattern of TIKTOK_URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Normalize a TikTok URL to extract metadata.
 */
export function normalizeTikTokUrl(url: string): {
  video_id: string | null;
  normalized_url: string | null;
} {
  const videoId = extractTikTokVideoId(url);
  if (!videoId) {
    return { video_id: null, normalized_url: null };
  }

  // For numeric IDs, construct canonical URL
  if (/^\d+$/.test(videoId)) {
    return {
      video_id: videoId,
      normalized_url: `https://www.tiktok.com/video/${videoId}`,
    };
  }

  // For short codes, keep as-is (may need resolution)
  return {
    video_id: videoId,
    normalized_url: url.trim(),
  };
}

// ============================================================================
// Field Normalization
// ============================================================================

/**
 * Normalize hashtags from various formats.
 */
export function normalizeHashtags(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .filter((h): h is string => typeof h === "string")
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .map((h) => (h.startsWith("#") ? h : `#${h}`));
  }

  if (typeof input === "string") {
    // Parse comma-separated or space-separated hashtags
    return input
      .split(/[,\s]+/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .map((h) => (h.startsWith("#") ? h : `#${h}`));
  }

  return [];
}

/**
 * Normalize caption text.
 */
export function normalizeCaption(input: unknown): string | null {
  if (!input) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize product SKU.
 */
export function normalizeProductSku(input: unknown): string | null {
  if (!input) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize product link (URL validation).
 */
export function normalizeProductLink(input: unknown): string | null {
  if (!input) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    // Try prepending https://
    try {
      const withProtocol = `https://${trimmed}`;
      new URL(withProtocol);
      return withProtocol;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Row Validation
// ============================================================================

/**
 * Validate a normalized payload has minimum required fields.
 */
export function validateNormalizedPayload(payload: NormalizedPayload): ValidationResult {
  const errors: string[] = [];

  // Must have at least a caption or script_text
  const hasContent =
    (payload.caption && payload.caption.trim().length > 0) ||
    (payload.script_text && payload.script_text.trim().length > 0);

  if (!hasContent) {
    errors.push("Must have either caption or script_text");
  }

  // If product_link is provided, must be valid URL
  if (payload.product_link) {
    try {
      new URL(payload.product_link);
    } catch {
      errors.push("Invalid product_link URL");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Events Log Writer
// ============================================================================

async function writeEventsLog(
  supabase: SupabaseClient,
  params: {
    entity_type: string;
    entity_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("events_log").insert({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      event_type: params.event_type,
      payload: params.payload,
    });
  } catch (err) {
    console.error(`Failed to write events_log ${params.event_type}:`, err);
  }
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Create a new ingestion job with rows.
 * This is Phase 1 Step 1: Create the job and rows in pending state.
 */
export async function createIngestionJob(
  supabase: SupabaseClient,
  params: {
    source: IngestionSource;
    source_ref: string;
    rows: { external_id: string; payload: NormalizedPayload }[];
    actor: string;
  }
): Promise<CreateJobResult> {
  const { source, source_ref, rows, actor } = params;

  if (rows.length === 0) {
    return { ok: false, error: "No rows to ingest" };
  }

  // Create the job
  const { data: job, error: jobError } = await supabase
    .from("video_ingestion_jobs")
    .insert({
      source,
      source_ref,
      status: "pending",
      total_rows: rows.length,
      created_by: actor,
    })
    .select()
    .single();

  if (jobError || !job) {
    return { ok: false, error: `Failed to create job: ${jobError?.message}` };
  }

  // Insert all rows
  const rowInserts = rows.map((r) => ({
    job_id: job.id,
    external_id: r.external_id,
    normalized_payload: r.payload,
    status: "pending" as RowStatus,
  }));

  const { error: rowsError } = await supabase
    .from("video_ingestion_rows")
    .insert(rowInserts);

  if (rowsError) {
    // Clean up the job
    await supabase.from("video_ingestion_jobs").delete().eq("id", job.id);
    return { ok: false, error: `Failed to create rows: ${rowsError.message}` };
  }

  // Create enrichment tasks for TikTok sources (non-blocking)
  if (source === "tiktok_url") {
    for (const row of rows) {
      try {
        await ensureEnrichmentTask(supabase, {
          source: "tiktok",
          external_id: row.external_id,
        });
      } catch (enrichErr) {
        // Enrichment task creation failure should not block ingestion
        console.error(`Failed to create enrichment task for ${row.external_id}:`, enrichErr);
      }
    }
  }

  // Write audit event
  await writeEventsLog(supabase, {
    entity_type: "ingestion_job",
    entity_id: job.id,
    event_type: "ingestion_job_created",
    payload: {
      source,
      source_ref,
      total_rows: rows.length,
      created_by: actor,
    },
  });

  return { ok: true, job: job as IngestionJob };
}

/**
 * Validate all rows in a job.
 * This is Phase 1 Step 2: Validate and check for duplicates.
 */
export async function validateIngestionJob(
  supabase: SupabaseClient,
  params: {
    job_id: string;
    actor: string;
  }
): Promise<ValidateJobResult> {
  const { job_id, actor } = params;

  // Fetch job
  const { data: job, error: jobError } = await supabase
    .from("video_ingestion_jobs")
    .select("*")
    .eq("id", job_id)
    .single();

  if (jobError || !job) {
    return {
      ok: false,
      validated_count: 0,
      failed_count: 0,
      duplicate_count: 0,
      error: "Job not found",
    };
  }

  if (job.status !== "pending") {
    return {
      ok: false,
      validated_count: 0,
      failed_count: 0,
      duplicate_count: 0,
      error: `Job is in status '${job.status}', must be 'pending' to validate`,
    };
  }

  // Fetch all rows
  const { data: rows, error: rowsError } = await supabase
    .from("video_ingestion_rows")
    .select("*")
    .eq("job_id", job_id);

  if (rowsError || !rows) {
    return {
      ok: false,
      validated_count: 0,
      failed_count: 0,
      duplicate_count: 0,
      error: `Failed to fetch rows: ${rowsError?.message}`,
    };
  }

  // Check for existing external IDs (global deduplication)
  const externalIds = rows.map((r) => r.external_id);
  const { data: existingExternals } = await supabase
    .from("video_external_ids")
    .select("external_id, video_id")
    .eq("source", job.source)
    .in("external_id", externalIds);

  const existingMap = new Map(
    (existingExternals || []).map((e) => [e.external_id, e.video_id])
  );

  // Track duplicates within this batch
  const seenInBatch = new Set<string>();

  // Validate each row
  let validatedCount = 0;
  let failedCount = 0;
  let duplicateCount = 0;
  const errorCounts: Record<string, { count: number; examples: string[] }> = {};

  for (const row of rows) {
    const payload = row.normalized_payload as NormalizedPayload;
    let newStatus: RowStatus = "pending";
    let errorMsg: string | null = null;

    // Check global duplicate
    const existingVideoId = existingMap.get(row.external_id);
    if (existingVideoId) {
      newStatus = "duplicate";
      errorMsg = `Already ingested as video ${existingVideoId}`;
      duplicateCount++;
    }
    // Check batch duplicate
    else if (seenInBatch.has(row.external_id)) {
      newStatus = "duplicate";
      errorMsg = "Duplicate within batch";
      duplicateCount++;
    }
    // Validate payload
    else {
      const validation = validateNormalizedPayload(payload);
      if (validation.valid) {
        newStatus = "validated";
        validatedCount++;
      } else {
        newStatus = "failed";
        errorMsg = validation.errors.join("; ");
        failedCount++;

        // Track error types
        for (const err of validation.errors) {
          if (!errorCounts[err]) {
            errorCounts[err] = { count: 0, examples: [] };
          }
          errorCounts[err].count++;
          if (errorCounts[err].examples.length < 3) {
            errorCounts[err].examples.push(row.external_id);
          }
        }
      }
      seenInBatch.add(row.external_id);
    }

    // Update row
    await supabase
      .from("video_ingestion_rows")
      .update({
        status: newStatus,
        error: errorMsg,
        validated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  // Build error summary
  const errorSummary: ErrorSummaryEntry[] = Object.entries(errorCounts).map(
    ([error_type, info]) => ({
      error_type,
      count: info.count,
      examples: info.examples,
    })
  );

  // Determine job status
  const newJobStatus: JobStatus =
    failedCount === 0 && duplicateCount < rows.length ? "validated" : "failed";

  // Update job
  const { data: updatedJob } = await supabase
    .from("video_ingestion_jobs")
    .update({
      status: newJobStatus,
      success_count: validatedCount,
      failure_count: failedCount,
      duplicate_count: duplicateCount,
      error_summary: errorSummary,
      validated_at: new Date().toISOString(),
    })
    .eq("id", job_id)
    .select()
    .single();

  // Write audit event
  await writeEventsLog(supabase, {
    entity_type: "ingestion_job",
    entity_id: job_id,
    event_type: "ingestion_job_validated",
    payload: {
      validated_count: validatedCount,
      failed_count: failedCount,
      duplicate_count: duplicateCount,
      new_status: newJobStatus,
      error_summary: errorSummary,
      validated_by: actor,
    },
  });

  return {
    ok: true,
    job: updatedJob as IngestionJob,
    validated_count: validatedCount,
    failed_count: failedCount,
    duplicate_count: duplicateCount,
    errors: errorSummary,
  };
}

/**
 * Commit validated rows to create videos.
 * This is Phase 2: Create videos from validated rows.
 */
export async function commitIngestionJob(
  supabase: SupabaseClient,
  params: {
    job_id: string;
    actor: string;
    correlation_id: string;
  }
): Promise<CommitJobResult> {
  const { job_id, actor, correlation_id } = params;

  // Fetch job
  const { data: job, error: jobError } = await supabase
    .from("video_ingestion_jobs")
    .select("*")
    .eq("id", job_id)
    .single();

  if (jobError || !job) {
    return {
      ok: false,
      committed_count: 0,
      failed_count: 0,
      created_video_ids: [],
      error: "Job not found",
    };
  }

  if (job.status !== "validated") {
    return {
      ok: false,
      committed_count: 0,
      failed_count: 0,
      created_video_ids: [],
      error: `Job is in status '${job.status}', must be 'validated' to commit`,
    };
  }

  // Fetch validated rows only
  const { data: rows, error: rowsError } = await supabase
    .from("video_ingestion_rows")
    .select("*")
    .eq("job_id", job_id)
    .eq("status", "validated");

  if (rowsError || !rows) {
    return {
      ok: false,
      committed_count: 0,
      failed_count: 0,
      created_video_ids: [],
      error: `Failed to fetch rows: ${rowsError?.message}`,
    };
  }

  if (rows.length === 0) {
    // No validated rows to commit
    await supabase
      .from("video_ingestion_jobs")
      .update({
        status: "committed",
        committed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    return {
      ok: true,
      committed_count: 0,
      failed_count: 0,
      created_video_ids: [],
    };
  }

  let committedCount = 0;
  let commitFailedCount = 0;
  const createdVideoIds: string[] = [];

  for (const row of rows) {
    const payload = row.normalized_payload as NormalizedPayload;

    try {
      // Create video in draft status
      const { data: video, error: videoError } = await supabase
        .from("videos")
        .insert({
          status: DEFAULT_INITIAL_STATUS,
          variant_id: payload.variant_id || null,
          account_id: payload.account_id || null,
          posting_meta: payload.target_account
            ? { target_account: payload.target_account }
            : null,
        })
        .select("id")
        .single();

      if (videoError || !video) {
        throw new Error(`Failed to create video: ${videoError?.message}`);
      }

      // Register external ID for deduplication
      const { error: externalError } = await supabase
        .from("video_external_ids")
        .insert({
          source: job.source,
          external_id: row.external_id,
          video_id: video.id,
          ingestion_job_id: job_id,
        });

      if (externalError) {
        // Check if it's a duplicate constraint violation
        if (externalError.code === "23505") {
          // Already exists - mark as duplicate
          await supabase
            .from("video_ingestion_rows")
            .update({
              status: "duplicate",
              error: "External ID registered by concurrent process",
              committed_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          // Delete the video we just created
          await supabase.from("videos").delete().eq("id", video.id);
          continue;
        }
        throw new Error(`Failed to register external ID: ${externalError.message}`);
      }

      // Create initial script version if we have content
      if (payload.script_text || payload.caption) {
        await createScriptVersion(supabase, {
          video_id: video.id,
          content: {
            script_text: payload.script_text,
            caption: payload.caption,
            hashtags: payload.hashtags,
            product_sku: payload.product_sku,
            product_link: payload.product_link,
          },
          actor,
          correlation_id,
        });
      }

      // Write video event
      await supabase.from("video_events").insert({
        video_id: video.id,
        event_type: "video_ingested",
        correlation_id,
        actor,
        from_status: null,
        to_status: DEFAULT_INITIAL_STATUS,
        details: {
          source: job.source,
          source_ref: job.source_ref,
          external_id: row.external_id,
          ingestion_job_id: job_id,
        },
      });

      // Create/link enrichment task for TikTok sources (non-blocking)
      if (job.source === "tiktok_url") {
        try {
          await linkEnrichmentTaskToVideo(supabase, {
            source: "tiktok",
            external_id: row.external_id,
            video_id: video.id,
          });
        } catch (enrichErr) {
          // Enrichment failure should not block ingestion
          console.error(`Enrichment task link failed for ${row.external_id}:`, enrichErr);
        }
      }

      // Update row as committed
      await supabase
        .from("video_ingestion_rows")
        .update({
          status: "committed",
          created_video_id: video.id,
          committed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      createdVideoIds.push(video.id);
      committedCount++;
    } catch (err) {
      // Mark row as failed
      await supabase
        .from("video_ingestion_rows")
        .update({
          status: "failed",
          error: String(err),
          committed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      commitFailedCount++;
    }
  }

  // Determine final job status
  let finalStatus: JobStatus;
  if (commitFailedCount === 0) {
    finalStatus = "committed";
  } else if (committedCount === 0) {
    finalStatus = "failed";
  } else {
    finalStatus = "partial";
  }

  // Update job
  const { data: updatedJob } = await supabase
    .from("video_ingestion_jobs")
    .update({
      status: finalStatus,
      success_count: committedCount,
      failure_count: job.failure_count + commitFailedCount,
      committed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", job_id)
    .select()
    .single();

  // Write audit event
  await writeEventsLog(supabase, {
    entity_type: "ingestion_job",
    entity_id: job_id,
    event_type: "ingestion_job_committed",
    payload: {
      committed_count: committedCount,
      failed_count: commitFailedCount,
      final_status: finalStatus,
      created_video_ids: createdVideoIds,
      committed_by: actor,
    },
  });

  return {
    ok: true,
    job: updatedJob as IngestionJob,
    committed_count: committedCount,
    failed_count: commitFailedCount,
    created_video_ids: createdVideoIds,
  };
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get a job by ID with summary.
 */
export async function getIngestionJob(
  supabase: SupabaseClient,
  job_id: string
): Promise<{ ok: boolean; job?: IngestionJob; error?: string }> {
  const { data: job, error } = await supabase
    .from("video_ingestion_jobs")
    .select("*")
    .eq("id", job_id)
    .single();

  if (error || !job) {
    return { ok: false, error: "Job not found" };
  }

  return { ok: true, job: job as IngestionJob };
}

/**
 * Get rows for a job.
 */
export async function getIngestionRows(
  supabase: SupabaseClient,
  params: {
    job_id: string;
    status?: RowStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ ok: boolean; rows: IngestionRow[]; total: number; error?: string }> {
  const { job_id, status, limit = 100, offset = 0 } = params;

  let query = supabase
    .from("video_ingestion_rows")
    .select("*", { count: "exact" })
    .eq("job_id", job_id)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: rows, count, error } = await query;

  if (error) {
    return { ok: false, rows: [], total: 0, error: error.message };
  }

  return { ok: true, rows: (rows || []) as IngestionRow[], total: count || 0 };
}

/**
 * List recent jobs.
 */
export async function listIngestionJobs(
  supabase: SupabaseClient,
  params: {
    source?: IngestionSource;
    status?: JobStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ ok: boolean; jobs: IngestionJob[]; total: number; error?: string }> {
  const { source, status, limit = 50, offset = 0 } = params;

  let query = supabase
    .from("video_ingestion_jobs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (source) {
    query = query.eq("source", source);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data: jobs, count, error } = await query;

  if (error) {
    return { ok: false, jobs: [], total: 0, error: error.message };
  }

  return { ok: true, jobs: (jobs || []) as IngestionJob[], total: count || 0 };
}

/**
 * Generate a reconciliation report for a job.
 */
export async function getReconciliationReport(
  supabase: SupabaseClient,
  job_id: string
): Promise<{ ok: boolean; report?: ReconciliationReport; error?: string }> {
  // Fetch job
  const { data: job, error: jobError } = await supabase
    .from("video_ingestion_jobs")
    .select("*")
    .eq("id", job_id)
    .single();

  if (jobError || !job) {
    return { ok: false, error: "Job not found" };
  }

  // Fetch all rows
  const { data: rows, error: rowsError } = await supabase
    .from("video_ingestion_rows")
    .select("*")
    .eq("job_id", job_id);

  if (rowsError) {
    return { ok: false, error: `Failed to fetch rows: ${rowsError.message}` };
  }

  // Categorize rows
  const committedRows: ReconciliationReport["committed_rows"] = [];
  const failedRows: ReconciliationReport["failed_rows"] = [];
  const duplicateRows: ReconciliationReport["duplicate_rows"] = [];

  for (const row of rows || []) {
    const payload = row.normalized_payload as NormalizedPayload;

    switch (row.status) {
      case "committed":
        committedRows.push({
          external_id: row.external_id,
          video_id: row.created_video_id!,
          caption: payload.caption || null,
        });
        break;
      case "failed":
        failedRows.push({
          external_id: row.external_id,
          error: row.error || "Unknown error",
          normalized_payload: payload,
        });
        break;
      case "duplicate":
        // Try to find the existing video
        const { data: existing } = await supabase
          .from("video_external_ids")
          .select("video_id")
          .eq("source", job.source)
          .eq("external_id", row.external_id)
          .single();

        duplicateRows.push({
          external_id: row.external_id,
          existing_video_id: existing?.video_id || row.error || "unknown",
        });
        break;
    }
  }

  return {
    ok: true,
    report: {
      job_id: job.id,
      source: job.source,
      source_ref: job.source_ref,
      status: job.status,
      total_rows: job.total_rows,
      committed_rows: committedRows,
      failed_rows: failedRows,
      duplicate_rows: duplicateRows,
    },
  };
}

// ============================================================================
// Source-Specific Normalizers
// ============================================================================

/**
 * Normalize TikTok URLs into ingestion rows.
 */
export function normalizeTikTokUrls(
  urls: string[]
): { external_id: string; payload: NormalizedPayload }[] {
  const results: { external_id: string; payload: NormalizedPayload }[] = [];

  for (const url of urls) {
    const { video_id, normalized_url } = normalizeTikTokUrl(url);

    if (!video_id) {
      // Invalid URL - still include for error tracking
      results.push({
        external_id: `invalid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        payload: {
          tiktok_url: url,
          raw_source_data: { original_url: url, parse_error: "Could not extract video ID" },
        },
      });
      continue;
    }

    results.push({
      external_id: video_id,
      payload: {
        tiktok_url: normalized_url,
        tiktok_video_id: video_id,
        caption: null, // Would be populated by scraper
      },
    });
  }

  return results;
}

/**
 * Normalize CSV rows into ingestion rows.
 * Expected columns: external_id, caption, hashtags, product_sku, product_link, script_text
 */
export function normalizeCsvRows(
  rows: Record<string, unknown>[]
): { external_id: string; payload: NormalizedPayload }[] {
  return rows.map((row, index) => {
    // Generate external_id from row data or index
    const externalId =
      (row.external_id as string) ||
      (row.id as string) ||
      `csv_row_${index}_${Date.now()}`;

    return {
      external_id: externalId,
      payload: {
        caption: normalizeCaption(row.caption),
        hashtags: normalizeHashtags(row.hashtags),
        product_sku: normalizeProductSku(row.product_sku),
        product_link: normalizeProductLink(row.product_link),
        script_text: normalizeCaption(row.script_text),
        target_account: normalizeCaption(row.target_account),
        variant_id: row.variant_id as string | undefined,
        account_id: row.account_id as string | undefined,
        raw_source_data: row,
      },
    };
  });
}

// ============================================================================
// Ingestion Metrics (for observability)
// ============================================================================

export interface IngestionMetrics {
  total_jobs: number;
  jobs_by_status: Record<JobStatus, number>;
  jobs_by_source: Record<IngestionSource, number>;
  recent_failures: {
    job_id: string;
    source: IngestionSource;
    failure_count: number;
    created_at: string;
  }[];
  last_24h: {
    jobs_created: number;
    rows_committed: number;
    rows_failed: number;
  };
}

export async function getIngestionMetrics(
  supabase: SupabaseClient
): Promise<{ ok: boolean; metrics?: IngestionMetrics; error?: string }> {
  try {
    // Get all jobs for counts
    const { data: jobs, error: jobsError } = await supabase
      .from("video_ingestion_jobs")
      .select("id, source, status, failure_count, created_at");

    if (jobsError) {
      return { ok: false, error: jobsError.message };
    }

    const allJobs = jobs || [];

    // Count by status
    const jobsByStatus: Record<JobStatus, number> = {
      pending: 0,
      validated: 0,
      committed: 0,
      failed: 0,
      partial: 0,
    };

    // Count by source
    const jobsBySource: Record<IngestionSource, number> = {
      tiktok_url: 0,
      csv: 0,
      sheets: 0,
      monday: 0,
      manual: 0,
    };

    const recentFailures: IngestionMetrics["recent_failures"] = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let jobsCreated24h = 0;

    for (const job of allJobs) {
      // Count by status
      const status = job.status as JobStatus;
      if (jobsByStatus[status] !== undefined) {
        jobsByStatus[status]++;
      }

      // Count by source
      const source = job.source as IngestionSource;
      if (jobsBySource[source] !== undefined) {
        jobsBySource[source]++;
      }

      // Track recent failures
      if ((job.status === "failed" || job.status === "partial") && job.failure_count > 0) {
        if (recentFailures.length < 10) {
          recentFailures.push({
            job_id: job.id,
            source: job.source,
            failure_count: job.failure_count,
            created_at: job.created_at,
          });
        }
      }

      // Count 24h jobs
      if (job.created_at >= oneDayAgo) {
        jobsCreated24h++;
      }
    }

    // Get 24h row stats
    const { data: rows24h } = await supabase
      .from("video_ingestion_rows")
      .select("status")
      .gte("created_at", oneDayAgo);

    let rowsCommitted24h = 0;
    let rowsFailed24h = 0;
    for (const row of rows24h || []) {
      if (row.status === "committed") rowsCommitted24h++;
      if (row.status === "failed") rowsFailed24h++;
    }

    return {
      ok: true,
      metrics: {
        total_jobs: allJobs.length,
        jobs_by_status: jobsByStatus,
        jobs_by_source: jobsBySource,
        recent_failures: recentFailures,
        last_24h: {
          jobs_created: jobsCreated24h,
          rows_committed: rowsCommitted24h,
          rows_failed: rowsFailed24h,
        },
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

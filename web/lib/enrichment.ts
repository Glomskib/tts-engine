/**
 * enrichment.ts
 *
 * Async enrichment pipeline for TikTok URL ingestions.
 * Fetches metadata from external sources with retry support.
 *
 * Key properties:
 * - Non-blocking: ingestion succeeds even if enrichment fails
 * - Retry-safe: exponential backoff with max attempts
 * - Idempotent: duplicate tasks are prevented by unique constraint
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export const ENRICHMENT_TASK_STATUSES = ["pending", "succeeded", "failed", "retrying"] as const;
export type EnrichmentTaskStatus = (typeof ENRICHMENT_TASK_STATUSES)[number];

export interface EnrichmentTask {
  id: string;
  source: string;
  external_id: string;
  video_id: string | null;
  status: EnrichmentTaskStatus;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  next_retry_at: string;
  extracted_meta: TikTokMeta | null;
  created_at: string;
  updated_at: string;
}

export interface TikTokMeta {
  creator_handle?: string | null;
  creator_name?: string | null;
  description?: string | null;
  posted_at?: string | null;
  duration_seconds?: number | null;
  cover_url?: string | null;
  canonical_url?: string | null;
  music_title?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  view_count?: number | null;
  fetched_at?: string;
}

export interface EnrichmentResult {
  task_id: string;
  external_id: string;
  status: "succeeded" | "failed" | "retrying";
  error?: string;
  meta?: TikTokMeta;
}

export interface RunEnrichmentResult {
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  results: EnrichmentResult[];
  error?: string;
}

export interface EnrichmentStatusResult {
  ok: boolean;
  counts: {
    pending: number;
    succeeded: number;
    failed: number;
    retrying: number;
    total: number;
  };
  recent_failures: {
    id: string;
    external_id: string;
    last_error: string;
    attempt_count: number;
    last_attempt_at: string;
  }[];
  success_rate_24h: number;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 60_000; // 1 minute
const MAX_RETRY_DELAY_MS = 3600_000; // 1 hour

// User agent for HTTP requests
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ============================================================================
// URL Construction
// ============================================================================

/**
 * Build canonical TikTok URL from external_id.
 */
export function buildTikTokUrl(externalId: string): string {
  // If it's a numeric ID, build the canonical video URL
  if (/^\d+$/.test(externalId)) {
    return `https://www.tiktok.com/@/video/${externalId}`;
  }
  // If it's a short code, use the short URL format
  return `https://vm.tiktok.com/${externalId}`;
}

// ============================================================================
// Exponential Backoff
// ============================================================================

/**
 * Calculate next retry time with exponential backoff.
 */
export function calculateNextRetryAt(attemptCount: number): Date {
  // Exponential backoff: 1min, 2min, 4min, 8min, 16min (capped at 1 hour)
  const delayMs = Math.min(
    BASE_RETRY_DELAY_MS * Math.pow(2, attemptCount),
    MAX_RETRY_DELAY_MS
  );
  return new Date(Date.now() + delayMs);
}

// ============================================================================
// HTML Metadata Extraction
// ============================================================================

/**
 * Extract metadata from TikTok page HTML.
 * Parses Open Graph meta tags and JSON-LD structured data.
 */
export function extractTikTokMetaFromHtml(html: string): TikTokMeta {
  const meta: TikTokMeta = {
    fetched_at: new Date().toISOString(),
  };

  // Extract Open Graph meta tags
  const ogPatterns: [RegExp, keyof TikTokMeta][] = [
    [/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/, "description"],
    [/<meta[^>]+content="([^"]*)"[^>]+property="og:description"/, "description"],
    [/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/, "cover_url"],
    [/<meta[^>]+content="([^"]*)"[^>]+property="og:image"/, "cover_url"],
    [/<meta[^>]+property="og:url"[^>]+content="([^"]*)"/, "canonical_url"],
    [/<meta[^>]+content="([^"]*)"[^>]+property="og:url"/, "canonical_url"],
  ];

  for (const [pattern, key] of ogPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      (meta as Record<string, unknown>)[key] = decodeHtmlEntities(match[1]);
    }
  }

  // Extract creator handle from URL pattern or meta
  const handleMatch = html.match(/tiktok\.com\/@([^\/\?"]+)/);
  if (handleMatch && handleMatch[1]) {
    meta.creator_handle = `@${handleMatch[1]}`;
  }

  // Try to extract JSON-LD structured data
  const jsonLdMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch && jsonLdMatch[1]) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      if (jsonLd["@type"] === "VideoObject") {
        meta.description = meta.description || jsonLd.description;
        meta.duration_seconds = parseDuration(jsonLd.duration);
        meta.posted_at = jsonLd.uploadDate || jsonLd.datePublished;
        meta.cover_url = meta.cover_url || jsonLd.thumbnailUrl;
        if (jsonLd.author) {
          meta.creator_name = jsonLd.author.name;
          meta.creator_handle = meta.creator_handle || jsonLd.author.alternateName;
        }
      }
    } catch {
      // JSON-LD parsing failed, continue with meta tags
    }
  }

  // Try to extract from __UNIVERSAL_DATA_FOR_REHYDRATION__ script
  const hydrationMatch = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
  if (hydrationMatch && hydrationMatch[1]) {
    try {
      const data = JSON.parse(hydrationMatch[1]);
      const itemModule = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (itemModule) {
        meta.description = meta.description || itemModule.desc;
        meta.creator_handle = meta.creator_handle || `@${itemModule.author?.uniqueId}`;
        meta.creator_name = meta.creator_name || itemModule.author?.nickname;
        meta.duration_seconds = meta.duration_seconds || itemModule.video?.duration;
        meta.cover_url = meta.cover_url || itemModule.video?.cover;
        meta.music_title = itemModule.music?.title;
        meta.like_count = itemModule.stats?.diggCount;
        meta.comment_count = itemModule.stats?.commentCount;
        meta.share_count = itemModule.stats?.shareCount;
        meta.view_count = itemModule.stats?.playCount;
        meta.posted_at = meta.posted_at || (itemModule.createTime ? new Date(itemModule.createTime * 1000).toISOString() : null);
      }
    } catch {
      // Hydration data parsing failed, continue
    }
  }

  // Try SIGI_STATE pattern (alternative data format)
  const sigiMatch = html.match(/<script[^>]+id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i);
  if (sigiMatch && sigiMatch[1]) {
    try {
      const data = JSON.parse(sigiMatch[1]);
      const itemModule = data?.ItemModule;
      if (itemModule) {
        const videoId = Object.keys(itemModule)[0];
        const item = itemModule[videoId];
        if (item) {
          meta.description = meta.description || item.desc;
          meta.creator_handle = meta.creator_handle || `@${item.author}`;
          meta.duration_seconds = meta.duration_seconds || item.video?.duration;
          meta.cover_url = meta.cover_url || item.video?.cover;
          meta.like_count = meta.like_count || item.stats?.diggCount;
          meta.view_count = meta.view_count || item.stats?.playCount;
        }
      }
    } catch {
      // SIGI_STATE parsing failed, continue
    }
  }

  return meta;
}

/**
 * Parse ISO 8601 duration to seconds.
 */
function parseDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  // PT1M30S -> 90 seconds
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Decode HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

// ============================================================================
// HTTP Fetching
// ============================================================================

/**
 * Fetch TikTok page HTML.
 */
async function fetchTikTokHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Task Management
// ============================================================================

/**
 * Create or update an enrichment task for a TikTok external_id.
 * Idempotent: if task exists, returns existing task.
 */
export async function ensureEnrichmentTask(
  supabase: SupabaseClient,
  params: {
    source: string;
    external_id: string;
    video_id?: string;
  }
): Promise<{ ok: boolean; task?: EnrichmentTask; error?: string }> {
  const { source, external_id, video_id } = params;

  // Try to insert, on conflict do nothing (idempotent)
  const { data: existing } = await supabase
    .from("video_enrichment_tasks")
    .select("*")
    .eq("source", source)
    .eq("external_id", external_id)
    .single();

  if (existing) {
    // Task exists, update video_id if provided and not already set
    if (video_id && !existing.video_id) {
      const { data: updated, error: updateError } = await supabase
        .from("video_enrichment_tasks")
        .update({
          video_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) {
        return { ok: false, error: `Failed to update task: ${updateError.message}` };
      }
      return { ok: true, task: updated as EnrichmentTask };
    }
    return { ok: true, task: existing as EnrichmentTask };
  }

  // Create new task
  const { data: newTask, error: insertError } = await supabase
    .from("video_enrichment_tasks")
    .insert({
      source,
      external_id,
      video_id: video_id || null,
      status: "pending",
      attempt_count: 0,
      max_attempts: MAX_ATTEMPTS,
      next_retry_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    // Check for unique constraint violation (concurrent insert)
    if (insertError.code === "23505") {
      // Race condition - fetch the existing task
      const { data: raceTask } = await supabase
        .from("video_enrichment_tasks")
        .select("*")
        .eq("source", source)
        .eq("external_id", external_id)
        .single();
      if (raceTask) {
        return { ok: true, task: raceTask as EnrichmentTask };
      }
    }
    return { ok: false, error: `Failed to create task: ${insertError.message}` };
  }

  return { ok: true, task: newTask as EnrichmentTask };
}

/**
 * Link an enrichment task to a video_id after ingestion commits.
 */
export async function linkEnrichmentTaskToVideo(
  supabase: SupabaseClient,
  params: {
    source: string;
    external_id: string;
    video_id: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { source, external_id, video_id } = params;

  const { error } = await supabase
    .from("video_enrichment_tasks")
    .update({
      video_id,
      updated_at: new Date().toISOString(),
    })
    .eq("source", source)
    .eq("external_id", external_id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // If the task already succeeded, apply the metadata to the video
  const { data: task } = await supabase
    .from("video_enrichment_tasks")
    .select("status, extracted_meta")
    .eq("source", source)
    .eq("external_id", external_id)
    .single();

  if (task?.status === "succeeded" && task.extracted_meta) {
    await supabase
      .from("videos")
      .update({
        source_meta: task.extracted_meta,
      })
      .eq("id", video_id);
  }

  return { ok: true };
}

/**
 * Claim pending/retrying tasks ready for processing.
 */
export async function claimEnrichmentTasks(
  supabase: SupabaseClient,
  limit: number
): Promise<{ ok: boolean; tasks: EnrichmentTask[]; error?: string }> {
  const now = new Date().toISOString();

  // Select tasks where status is pending/retrying and next_retry_at <= now
  const { data: tasks, error } = await supabase
    .from("video_enrichment_tasks")
    .select("*")
    .in("status", ["pending", "retrying"])
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { ok: false, tasks: [], error: error.message };
  }

  return { ok: true, tasks: (tasks || []) as EnrichmentTask[] };
}

/**
 * Process a single enrichment task.
 */
export async function processEnrichmentTask(
  supabase: SupabaseClient,
  task: EnrichmentTask
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    task_id: task.id,
    external_id: task.external_id,
    status: "failed",
  };

  try {
    // Build URL from external_id
    const url = buildTikTokUrl(task.external_id);

    // Fetch HTML
    const html = await fetchTikTokHtml(url);

    // Extract metadata
    const meta = extractTikTokMetaFromHtml(html);

    // Validate we got something useful
    if (!meta.description && !meta.creator_handle && !meta.cover_url) {
      throw new Error("No metadata could be extracted from page");
    }

    // Mark as succeeded and store metadata
    await supabase
      .from("video_enrichment_tasks")
      .update({
        status: "succeeded",
        extracted_meta: meta,
        last_attempt_at: new Date().toISOString(),
        attempt_count: task.attempt_count + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    // If video_id is known, update the video's source_meta
    if (task.video_id) {
      await supabase
        .from("videos")
        .update({
          source_meta: meta,
        })
        .eq("id", task.video_id);
    }

    result.status = "succeeded";
    result.meta = meta;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const newAttemptCount = task.attempt_count + 1;

    if (newAttemptCount >= task.max_attempts) {
      // Max attempts reached, mark as failed
      await supabase
        .from("video_enrichment_tasks")
        .update({
          status: "failed",
          last_error: errorMessage,
          last_attempt_at: new Date().toISOString(),
          attempt_count: newAttemptCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      result.status = "failed";
      result.error = `Max attempts (${task.max_attempts}) reached: ${errorMessage}`;
    } else {
      // Schedule retry with exponential backoff
      const nextRetryAt = calculateNextRetryAt(newAttemptCount);

      await supabase
        .from("video_enrichment_tasks")
        .update({
          status: "retrying",
          last_error: errorMessage,
          last_attempt_at: new Date().toISOString(),
          attempt_count: newAttemptCount,
          next_retry_at: nextRetryAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      result.status = "retrying";
      result.error = errorMessage;
    }
  }

  return result;
}

/**
 * Run enrichment for up to N tasks.
 */
export async function runEnrichment(
  supabase: SupabaseClient,
  limit: number
): Promise<RunEnrichmentResult> {
  // Claim tasks
  const claimResult = await claimEnrichmentTasks(supabase, limit);
  if (!claimResult.ok) {
    return {
      ok: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      results: [],
      error: claimResult.error,
    };
  }

  const tasks = claimResult.tasks;
  if (tasks.length === 0) {
    return {
      ok: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      results: [],
    };
  }

  const results: EnrichmentResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  // Process tasks sequentially to avoid rate limiting
  for (const task of tasks) {
    const result = await processEnrichmentTask(supabase, task);
    results.push(result);

    if (result.status === "succeeded") succeeded++;
    else if (result.status === "failed") failed++;
    else if (result.status === "retrying") retrying++;

    // Small delay between requests to be respectful
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    ok: true,
    processed: tasks.length,
    succeeded,
    failed,
    retrying,
    results,
  };
}

// ============================================================================
// Status / Observability
// ============================================================================

/**
 * Get enrichment status summary.
 */
export async function getEnrichmentStatus(
  supabase: SupabaseClient
): Promise<EnrichmentStatusResult> {
  try {
    // Get counts by status
    const { data: allTasks, error: countError } = await supabase
      .from("video_enrichment_tasks")
      .select("status");

    if (countError) {
      return {
        ok: false,
        counts: { pending: 0, succeeded: 0, failed: 0, retrying: 0, total: 0 },
        recent_failures: [],
        success_rate_24h: 0,
        error: countError.message,
      };
    }

    const counts = {
      pending: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      total: 0,
    };

    for (const task of allTasks || []) {
      counts.total++;
      const status = task.status as EnrichmentTaskStatus;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    }

    // Get recent failures (last 10)
    const { data: failures } = await supabase
      .from("video_enrichment_tasks")
      .select("id, external_id, last_error, attempt_count, last_attempt_at")
      .eq("status", "failed")
      .order("last_attempt_at", { ascending: false })
      .limit(10);

    // Calculate 24h success rate
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent24h } = await supabase
      .from("video_enrichment_tasks")
      .select("status")
      .gte("updated_at", oneDayAgo)
      .in("status", ["succeeded", "failed"]);

    let successRate24h = 0;
    if (recent24h && recent24h.length > 0) {
      const succeeded24h = recent24h.filter((t) => t.status === "succeeded").length;
      successRate24h = Math.round((succeeded24h / recent24h.length) * 100);
    }

    return {
      ok: true,
      counts,
      recent_failures: (failures || []).map((f) => ({
        id: f.id,
        external_id: f.external_id,
        last_error: f.last_error || "Unknown error",
        attempt_count: f.attempt_count,
        last_attempt_at: f.last_attempt_at || "",
      })),
      success_rate_24h: successRate24h,
    };
  } catch (err) {
    return {
      ok: false,
      counts: { pending: 0, succeeded: 0, failed: 0, retrying: 0, total: 0 },
      recent_failures: [],
      success_rate_24h: 0,
      error: String(err),
    };
  }
}

/**
 * Get enrichment metrics for observability integration.
 */
export async function getEnrichmentMetrics(
  supabase: SupabaseClient
): Promise<{
  ok: boolean;
  pending_tasks: number;
  failures_24h: number;
  success_rate_24h: number;
  error?: string;
}> {
  try {
    // Count pending/retrying tasks
    const { count: pendingCount } = await supabase
      .from("video_enrichment_tasks")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "retrying"]);

    // Count failures in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: failures24h } = await supabase
      .from("video_enrichment_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("updated_at", oneDayAgo);

    // Calculate success rate
    const { data: recent24h } = await supabase
      .from("video_enrichment_tasks")
      .select("status")
      .gte("updated_at", oneDayAgo)
      .in("status", ["succeeded", "failed"]);

    let successRate24h = 100;
    if (recent24h && recent24h.length > 0) {
      const succeeded = recent24h.filter((t) => t.status === "succeeded").length;
      successRate24h = Math.round((succeeded / recent24h.length) * 100);
    }

    return {
      ok: true,
      pending_tasks: pendingCount || 0,
      failures_24h: failures24h || 0,
      success_rate_24h: successRate24h,
    };
  } catch (err) {
    return {
      ok: false,
      pending_tasks: 0,
      failures_24h: 0,
      success_rate_24h: 0,
      error: String(err),
    };
  }
}

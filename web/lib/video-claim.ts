/**
 * video-claim.ts
 *
 * Atomic lease-based video claiming system.
 * All claim operations are idempotent and safe under concurrency.
 *
 * Key properties:
 * - Claims are leases with expiration (claim_expires_at)
 * - Atomic operations prevent race conditions
 * - Same user can extend their claim (idempotent)
 * - Expired claims can be reclaimed by anyone
 * - All operations write audit events to video_events
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export type ClaimRole = "recorder" | "editor" | "uploader" | "admin";

export interface ClaimResult {
  ok: boolean;
  video_id: string;
  action: "claimed" | "extended" | "already_claimed" | "not_found" | "not_claimable" | "error";
  claimed_by?: string | null;
  claim_role?: ClaimRole | null;
  claim_expires_at?: string | null;
  message: string;
  error_code?: string;
}

export interface ReleaseResult {
  ok: boolean;
  video_id: string;
  action: "released" | "not_owner" | "not_claimed" | "not_found" | "error";
  previous_claimed_by?: string | null;
  message: string;
  error_code?: string;
}

export interface RenewResult {
  ok: boolean;
  video_id: string;
  action: "renewed" | "not_owner" | "not_claimed" | "not_found" | "error";
  claim_expires_at?: string | null;
  message: string;
  error_code?: string;
}

export interface ExpireResult {
  ok: boolean;
  expired_count: number;
  expired_ids: string[];
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

// Default lease duration in minutes
export const DEFAULT_CLAIM_TTL_MINUTES = 240;

// Valid statuses for claiming
const CLAIMABLE_STATUSES = [
  "READY_TO_RECORD",
  "READY_TO_EDIT",
  "READY_TO_POST",
  "RECORDING_QUEUE",
  "EDITING_QUEUE",
  "POSTING_QUEUE",
];

// ============================================================================
// Video Event Writer
// ============================================================================

/**
 * Write a video event to video_events table.
 * Fire-and-forget - never throws.
 */
async function writeVideoEvent(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    event_type: string;
    correlation_id: string;
    actor: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("video_events").insert({
      video_id: params.video_id,
      event_type: params.event_type,
      correlation_id: params.correlation_id,
      actor: params.actor,
      from_status: null,
      to_status: null,
      details: params.details,
    });
  } catch (err) {
    console.error(`Failed to write video event ${params.event_type}:`, err);
  }
}

// ============================================================================
// Atomic Claim Operation
// ============================================================================

/**
 * Atomically claim a video using UPDATE ... WHERE.
 *
 * This operation is:
 * - Atomic: single SQL UPDATE with conditions
 * - Idempotent: same user claiming twice just extends lease
 * - Safe: concurrent claims cannot both succeed
 *
 * The UPDATE succeeds only if:
 * - Video exists with a claimable status
 * - AND (unclaimed OR expired OR same user)
 *
 * @param supabase - Supabase admin client
 * @param params - Claim parameters
 * @returns ClaimResult with action taken
 */
export async function atomicClaimVideo(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    actor: string;
    claim_role: ClaimRole;
    ttl_minutes?: number;
    correlation_id: string;
  }
): Promise<ClaimResult> {
  const { video_id, actor, claim_role, correlation_id } = params;
  const ttl = params.ttl_minutes ?? DEFAULT_CLAIM_TTL_MINUTES;
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

  // First, check if video exists and is in claimable status
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, status, claimed_by, claim_expires_at, claim_role")
    .eq("id", video_id)
    .single();

  if (fetchError || !video) {
    return {
      ok: false,
      video_id,
      action: "not_found",
      message: "Video not found",
      error_code: "NOT_FOUND",
    };
  }

  // Check if status is claimable
  if (!CLAIMABLE_STATUSES.includes(video.status)) {
    return {
      ok: false,
      video_id,
      action: "not_claimable",
      message: `Video status '${video.status}' is not claimable`,
      error_code: "NOT_CLAIMABLE",
    };
  }

  // Determine if this is an extension (same user with active claim)
  const hasActiveClaim =
    video.claimed_by &&
    video.claimed_by === actor &&
    video.claim_expires_at &&
    video.claim_expires_at > nowIso;

  // Atomic UPDATE with WHERE conditions:
  // - claimed_by IS NULL (unclaimed)
  // - OR claim_expires_at < now (expired)
  // - OR claimed_by = actor (same user extending)
  //
  // We use a single raw filter to ensure atomicity
  const { data: updated, error: updateError } = await supabase
    .from("videos")
    .update({
      claimed_by: actor,
      claimed_at: nowIso,
      claim_expires_at: expiresAt,
      claim_role: claim_role,
    })
    .eq("id", video_id)
    .or(`claimed_by.is.null,claim_expires_at.lt.${nowIso},claimed_by.eq.${actor}`)
    .select("id, claimed_by, claim_expires_at, claim_role")
    .maybeSingle();

  if (updateError) {
    console.error("Claim update error:", updateError);
    return {
      ok: false,
      video_id,
      action: "error",
      message: `Database error: ${updateError.message}`,
      error_code: "DB_ERROR",
    };
  }

  if (!updated) {
    // Update returned no rows - claim failed due to race condition
    // Re-fetch to get current claim info
    const { data: current } = await supabase
      .from("videos")
      .select("claimed_by, claim_expires_at, claim_role")
      .eq("id", video_id)
      .single();

    return {
      ok: false,
      video_id,
      action: "already_claimed",
      claimed_by: current?.claimed_by || null,
      claim_expires_at: current?.claim_expires_at || null,
      message: `Video is already claimed by ${current?.claimed_by || "unknown"}`,
      error_code: "ALREADY_CLAIMED",
    };
  }

  // Determine action type for event
  const action = hasActiveClaim ? "extended" : "claimed";
  const eventType = hasActiveClaim ? "claim_extended" : "claim";

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: eventType,
    correlation_id,
    actor,
    details: {
      claimed_by: actor,
      claim_role,
      claim_expires_at: expiresAt,
      ttl_minutes: ttl,
      action,
    },
  });

  return {
    ok: true,
    video_id,
    action,
    claimed_by: updated.claimed_by,
    claim_role: updated.claim_role as ClaimRole,
    claim_expires_at: updated.claim_expires_at,
    message: action === "extended" ? "Claim extended successfully" : "Video claimed successfully",
  };
}

// ============================================================================
// Atomic Release Operation
// ============================================================================

/**
 * Atomically release a video claim.
 *
 * This operation is:
 * - Atomic: single SQL UPDATE with conditions
 * - Idempotent: releasing an unclaimed video is a no-op success
 * - Safe: only the claim owner (or admin with force) can release
 *
 * @param supabase - Supabase admin client
 * @param params - Release parameters
 * @returns ReleaseResult with action taken
 */
export async function atomicReleaseVideo(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    actor: string;
    force?: boolean;
    is_admin?: boolean;
    correlation_id: string;
  }
): Promise<ReleaseResult> {
  const { video_id, actor, force, is_admin, correlation_id } = params;
  const forceAllowed = force === true && is_admin === true;

  // First check current state
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, claimed_by, claim_expires_at, claim_role")
    .eq("id", video_id)
    .single();

  if (fetchError || !video) {
    return {
      ok: false,
      video_id,
      action: "not_found",
      message: "Video not found",
      error_code: "NOT_FOUND",
    };
  }

  // If not claimed, return success (idempotent)
  if (!video.claimed_by) {
    return {
      ok: true,
      video_id,
      action: "not_claimed",
      message: "Video was not claimed",
    };
  }

  // Check ownership (unless force is allowed)
  if (!forceAllowed && video.claimed_by !== actor) {
    return {
      ok: false,
      video_id,
      action: "not_owner",
      previous_claimed_by: video.claimed_by,
      message: `Video is claimed by ${video.claimed_by}, not ${actor}`,
      error_code: "NOT_CLAIM_OWNER",
    };
  }

  // Build atomic update query
  let query = supabase
    .from("videos")
    .update({
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
      claim_role: null,
    })
    .eq("id", video_id);

  // If not forcing, also verify ownership in the WHERE clause
  if (!forceAllowed) {
    query = query.eq("claimed_by", actor);
  }

  const { data: updated, error: updateError } = await query
    .select("id, claimed_by")
    .maybeSingle();

  if (updateError) {
    console.error("Release update error:", updateError);
    return {
      ok: false,
      video_id,
      action: "error",
      message: `Database error: ${updateError.message}`,
      error_code: "DB_ERROR",
    };
  }

  if (!updated) {
    // Race condition - someone else may have claimed in between
    return {
      ok: false,
      video_id,
      action: "not_owner",
      message: "Failed to release - claim state changed",
      error_code: "RACE_CONDITION",
    };
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: forceAllowed ? "claim_force_released" : "claim_released",
    correlation_id,
    actor,
    details: {
      released_by: actor,
      previous_claimed_by: video.claimed_by,
      previous_claim_role: video.claim_role,
      force: forceAllowed,
    },
  });

  return {
    ok: true,
    video_id,
    action: "released",
    previous_claimed_by: video.claimed_by,
    message: "Claim released successfully",
  };
}

// ============================================================================
// Atomic Renew Operation
// ============================================================================

/**
 * Atomically renew (extend) an existing claim.
 *
 * This operation is:
 * - Atomic: single SQL UPDATE with conditions
 * - Idempotent: renewing multiple times just updates expiry
 * - Safe: only the claim owner can renew
 *
 * @param supabase - Supabase admin client
 * @param params - Renew parameters
 * @returns RenewResult with action taken
 */
export async function atomicRenewClaim(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    actor: string;
    ttl_minutes?: number;
    correlation_id: string;
  }
): Promise<RenewResult> {
  const { video_id, actor, correlation_id } = params;
  const ttl = params.ttl_minutes ?? DEFAULT_CLAIM_TTL_MINUTES;
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

  // First check current state
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, claimed_by, claim_expires_at")
    .eq("id", video_id)
    .single();

  if (fetchError || !video) {
    return {
      ok: false,
      video_id,
      action: "not_found",
      message: "Video not found",
      error_code: "NOT_FOUND",
    };
  }

  // If not claimed, cannot renew
  if (!video.claimed_by) {
    return {
      ok: false,
      video_id,
      action: "not_claimed",
      message: "Video is not claimed - cannot renew",
      error_code: "NOT_CLAIMED",
    };
  }

  // Check ownership
  if (video.claimed_by !== actor) {
    return {
      ok: false,
      video_id,
      action: "not_owner",
      message: `Video is claimed by ${video.claimed_by}, not ${actor}`,
      error_code: "NOT_CLAIM_OWNER",
    };
  }

  // Atomic UPDATE - only succeed if still owned by actor
  const { data: updated, error: updateError } = await supabase
    .from("videos")
    .update({
      claim_expires_at: expiresAt,
      claimed_at: nowIso, // Reset claimed_at to track renewal
    })
    .eq("id", video_id)
    .eq("claimed_by", actor)
    .select("id, claim_expires_at")
    .maybeSingle();

  if (updateError) {
    console.error("Renew update error:", updateError);
    return {
      ok: false,
      video_id,
      action: "error",
      message: `Database error: ${updateError.message}`,
      error_code: "DB_ERROR",
    };
  }

  if (!updated) {
    // Race condition - claim was released or taken
    return {
      ok: false,
      video_id,
      action: "not_owner",
      message: "Failed to renew - claim state changed",
      error_code: "RACE_CONDITION",
    };
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: "claim_renewed",
    correlation_id,
    actor,
    details: {
      renewed_by: actor,
      new_expires_at: expiresAt,
      previous_expires_at: video.claim_expires_at,
      ttl_minutes: ttl,
    },
  });

  return {
    ok: true,
    video_id,
    action: "renewed",
    claim_expires_at: updated.claim_expires_at,
    message: "Claim renewed successfully",
  };
}

// ============================================================================
// Expire/Reclaim Operation (Server-side recovery)
// ============================================================================

/**
 * Expire all claims that have passed their expiration time.
 * This is a server-side recovery mechanism.
 *
 * This operation is:
 * - Idempotent: running multiple times has no adverse effects
 * - Safe: only clears truly expired claims
 *
 * @param supabase - Supabase admin client
 * @param params - Expire parameters
 * @returns ExpireResult with count of expired claims
 */
export async function expireStaleClaimsAtomic(
  supabase: SupabaseClient,
  params: {
    actor: string;
    correlation_id: string;
  }
): Promise<ExpireResult> {
  const { actor, correlation_id } = params;
  const now = new Date().toISOString();

  // Find all expired claims in a single query
  const { data: expired, error: fetchError } = await supabase
    .from("videos")
    .select("id, claimed_by, claim_role, claim_expires_at")
    .not("claimed_by", "is", null)
    .lt("claim_expires_at", now);

  if (fetchError) {
    console.error("Expire fetch error:", fetchError);
    return {
      ok: false,
      expired_count: 0,
      expired_ids: [],
      message: `Database error: ${fetchError.message}`,
    };
  }

  if (!expired || expired.length === 0) {
    return {
      ok: true,
      expired_count: 0,
      expired_ids: [],
      message: "No expired claims found",
    };
  }

  const expiredIds = expired.map((v) => v.id);

  // Atomic UPDATE to clear all expired claims
  // Re-verify expiration in WHERE to handle races
  const { error: updateError } = await supabase
    .from("videos")
    .update({
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
      claim_role: null,
    })
    .in("id", expiredIds)
    .lt("claim_expires_at", now);

  if (updateError) {
    console.error("Expire update error:", updateError);
    return {
      ok: false,
      expired_count: 0,
      expired_ids: [],
      message: `Database error: ${updateError.message}`,
    };
  }

  // Write events for each expired claim
  for (const video of expired) {
    await writeVideoEvent(supabase, {
      video_id: video.id,
      event_type: "claim_expired",
      correlation_id,
      actor,
      details: {
        previous_claimed_by: video.claimed_by,
        previous_claim_role: video.claim_role,
        expired_at: video.claim_expires_at,
        cleared_at: now,
      },
    });
  }

  return {
    ok: true,
    expired_count: expiredIds.length,
    expired_ids: expiredIds,
    message: `Expired ${expiredIds.length} stale claim(s)`,
  };
}

// ============================================================================
// Helper: Check if video is claimable
// ============================================================================

/**
 * Check if a video can be claimed by a given actor.
 * Returns detailed status about claimability.
 */
export async function checkClaimability(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    actor: string;
  }
): Promise<{
  can_claim: boolean;
  reason: string;
  current_claim?: {
    claimed_by: string | null;
    claim_role: string | null;
    claim_expires_at: string | null;
    is_expired: boolean;
    is_owned_by_actor: boolean;
  };
}> {
  const { video_id, actor } = params;
  const now = new Date().toISOString();

  const { data: video, error } = await supabase
    .from("videos")
    .select("id, status, claimed_by, claim_role, claim_expires_at")
    .eq("id", video_id)
    .single();

  if (error || !video) {
    return { can_claim: false, reason: "Video not found" };
  }

  if (!CLAIMABLE_STATUSES.includes(video.status)) {
    return { can_claim: false, reason: `Status '${video.status}' is not claimable` };
  }

  const isExpired = video.claim_expires_at ? video.claim_expires_at < now : true;
  const isOwnedByActor = video.claimed_by === actor;
  const hasActiveClaim = video.claimed_by && !isExpired;

  const current_claim = {
    claimed_by: video.claimed_by,
    claim_role: video.claim_role,
    claim_expires_at: video.claim_expires_at,
    is_expired: isExpired,
    is_owned_by_actor: isOwnedByActor,
  };

  if (!hasActiveClaim) {
    return { can_claim: true, reason: "Video is available", current_claim };
  }

  if (isOwnedByActor) {
    return { can_claim: true, reason: "You already own this claim (will extend)", current_claim };
  }

  return {
    can_claim: false,
    reason: `Claimed by ${video.claimed_by} until ${video.claim_expires_at}`,
    current_claim,
  };
}

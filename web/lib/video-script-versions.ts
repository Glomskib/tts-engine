/**
 * video-script-versions.ts
 *
 * Video-scoped script versioning system with locking.
 * All versions are append-only; locked versions are immutable.
 *
 * Key properties:
 * - Append-only: versions are never deleted or modified
 * - Lockable: once locked, a version's content cannot change
 * - Hashable: content_hash proves immutability
 * - Audited: all operations emit video_events
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface ScriptVersionContent {
  script_text?: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
  product_sku?: string | null;
  product_link?: string | null;
  compliance_notes?: string | null;
}

export interface ScriptVersion extends ScriptVersionContent {
  id: string;
  video_id: string;
  version_number: number;
  content_hash: string;
  previous_hash: string | null;
  created_by: string;
  created_at: string;
  locked_at: string | null;
  locked_by: string | null;
}

export interface CurrentScriptInfo {
  video_id: string;
  current_version: ScriptVersion | null;
  is_locked: boolean;
  version_count: number;
}

export interface CreateVersionResult {
  ok: boolean;
  version?: ScriptVersion;
  message: string;
  error_code?: string;
}

export interface LockResult {
  ok: boolean;
  version?: ScriptVersion;
  message: string;
  error_code?: string;
}

export interface UnlockResult {
  ok: boolean;
  version?: ScriptVersion;
  message: string;
  error_code?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute SHA-256 hash of script content for immutability verification.
 */
export function computeContentHash(content: ScriptVersionContent): string {
  const normalized = JSON.stringify({
    script_text: content.script_text || "",
    caption: content.caption || "",
    hashtags: (content.hashtags || []).sort(),
    product_sku: content.product_sku || "",
    product_link: content.product_link || "",
    compliance_notes: content.compliance_notes || "",
  });
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Write a video event (fire-and-forget).
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
// Core Operations
// ============================================================================

/**
 * Get the current script version for a video.
 * Returns null if no script exists for this video.
 */
export async function getCurrentScriptVersion(
  supabase: SupabaseClient,
  video_id: string
): Promise<CurrentScriptInfo> {
  // Get current pointer
  const { data: pointer, error: pointerError } = await supabase
    .from("video_scripts")
    .select("current_version_id")
    .eq("video_id", video_id)
    .maybeSingle();

  if (pointerError) {
    console.error("Error fetching video_scripts pointer:", pointerError);
  }

  // Count total versions
  const { count } = await supabase
    .from("video_script_versions")
    .select("*", { count: "exact", head: true })
    .eq("video_id", video_id);

  if (!pointer?.current_version_id) {
    return {
      video_id,
      current_version: null,
      is_locked: false,
      version_count: count || 0,
    };
  }

  // Fetch current version
  const { data: version, error: versionError } = await supabase
    .from("video_script_versions")
    .select("*")
    .eq("id", pointer.current_version_id)
    .single();

  if (versionError || !version) {
    console.error("Error fetching current version:", versionError);
    return {
      video_id,
      current_version: null,
      is_locked: false,
      version_count: count || 0,
    };
  }

  return {
    video_id,
    current_version: version as ScriptVersion,
    is_locked: version.locked_at !== null,
    version_count: count || 0,
  };
}

/**
 * Get all versions for a video (newest first).
 */
export async function getScriptVersionHistory(
  supabase: SupabaseClient,
  video_id: string,
  limit: number = 50
): Promise<ScriptVersion[]> {
  const { data, error } = await supabase
    .from("video_script_versions")
    .select("*")
    .eq("video_id", video_id)
    .order("version_number", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching version history:", error);
    return [];
  }

  return (data || []) as ScriptVersion[];
}

/**
 * Create a new script version for a video.
 *
 * If the current version is locked and force_new_version is not true,
 * returns LOCKED error. If force_new_version=true, creates a new version
 * and sets it as current.
 */
export async function createScriptVersion(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    content: ScriptVersionContent;
    actor: string;
    correlation_id: string;
    force_new_version?: boolean;
  }
): Promise<CreateVersionResult> {
  const { video_id, content, actor, correlation_id, force_new_version = false } = params;

  // Check if video exists
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id")
    .eq("id", video_id)
    .single();

  if (videoError || !video) {
    return {
      ok: false,
      message: "Video not found",
      error_code: "NOT_FOUND",
    };
  }

  // Get current state
  const currentInfo = await getCurrentScriptVersion(supabase, video_id);

  // If current version exists and is locked, check force_new_version
  if (currentInfo.current_version && currentInfo.is_locked && !force_new_version) {
    await writeVideoEvent(supabase, {
      video_id,
      event_type: "script_update_rejected",
      correlation_id,
      actor,
      details: {
        reason: "Current version is locked",
        locked_version: currentInfo.current_version.version_number,
        locked_at: currentInfo.current_version.locked_at,
        locked_by: currentInfo.current_version.locked_by,
      },
    });

    return {
      ok: false,
      message: "Current version is locked. Use force_new_version=true to create a new version.",
      error_code: "SCRIPT_LOCKED",
    };
  }

  // Compute content hash
  const contentHash = computeContentHash(content);

  // Get previous hash (if any versions exist)
  const previousHash = currentInfo.current_version?.content_hash || null;

  // Get next version number atomically
  const { data: nextVersionData, error: nextVersionError } = await supabase
    .rpc("get_next_script_version_number", { p_video_id: video_id });

  if (nextVersionError) {
    console.error("Error getting next version number:", nextVersionError);
    return {
      ok: false,
      message: "Failed to get next version number",
      error_code: "DB_ERROR",
    };
  }

  const nextVersion = nextVersionData || 1;

  // Insert new version
  const { data: newVersion, error: insertError } = await supabase
    .from("video_script_versions")
    .insert({
      video_id,
      version_number: nextVersion,
      script_text: content.script_text,
      caption: content.caption,
      hashtags: content.hashtags || [],
      product_sku: content.product_sku,
      product_link: content.product_link,
      compliance_notes: content.compliance_notes,
      content_hash: contentHash,
      previous_hash: previousHash,
      created_by: actor,
    })
    .select()
    .single();

  if (insertError || !newVersion) {
    console.error("Error inserting new version:", insertError);
    return {
      ok: false,
      message: `Failed to create version: ${insertError?.message || "unknown error"}`,
      error_code: "DB_ERROR",
    };
  }

  // Upsert video_scripts pointer
  const { error: pointerError } = await supabase
    .from("video_scripts")
    .upsert(
      {
        video_id,
        current_version_id: newVersion.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "video_id" }
    );

  if (pointerError) {
    console.error("Error updating video_scripts pointer:", pointerError);
    // Version was created but pointer failed - log but continue
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: "script_version_created",
    correlation_id,
    actor,
    details: {
      version_number: nextVersion,
      version_id: newVersion.id,
      content_hash: contentHash,
      previous_hash: previousHash,
      force_new_version,
      had_locked_version: currentInfo.is_locked,
    },
  });

  return {
    ok: true,
    version: newVersion as ScriptVersion,
    message: `Created version ${nextVersion}`,
  };
}

/**
 * Lock the current script version.
 * Once locked, the version is immutable and its content_hash serves as proof.
 */
export async function lockCurrentVersion(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    actor: string;
    correlation_id: string;
  }
): Promise<LockResult> {
  const { video_id, actor, correlation_id } = params;

  // Get current version
  const currentInfo = await getCurrentScriptVersion(supabase, video_id);

  if (!currentInfo.current_version) {
    return {
      ok: false,
      message: "No script version exists for this video",
      error_code: "NO_SCRIPT",
    };
  }

  if (currentInfo.is_locked) {
    // Already locked - idempotent success
    return {
      ok: true,
      version: currentInfo.current_version,
      message: "Version is already locked",
    };
  }

  // Lock the version
  const now = new Date().toISOString();
  const { data: lockedVersion, error: lockError } = await supabase
    .from("video_script_versions")
    .update({
      locked_at: now,
      locked_by: actor,
    })
    .eq("id", currentInfo.current_version.id)
    .is("locked_at", null) // Only if not already locked (atomic)
    .select()
    .single();

  if (lockError) {
    console.error("Error locking version:", lockError);
    return {
      ok: false,
      message: `Failed to lock version: ${lockError.message}`,
      error_code: "DB_ERROR",
    };
  }

  if (!lockedVersion) {
    // Race condition - already locked
    const { data: refetched } = await supabase
      .from("video_script_versions")
      .select("*")
      .eq("id", currentInfo.current_version.id)
      .single();

    return {
      ok: true,
      version: refetched as ScriptVersion,
      message: "Version was locked concurrently",
    };
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: "script_version_locked",
    correlation_id,
    actor,
    details: {
      version_number: lockedVersion.version_number,
      version_id: lockedVersion.id,
      content_hash: lockedVersion.content_hash,
      locked_at: now,
    },
  });

  return {
    ok: true,
    version: lockedVersion as ScriptVersion,
    message: `Locked version ${lockedVersion.version_number}`,
  };
}

/**
 * Unlock a script version (admin-only operation).
 * This is a privileged operation that should be used sparingly.
 */
export async function unlockCurrentVersion(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    actor: string;
    correlation_id: string;
    is_admin: boolean;
  }
): Promise<UnlockResult> {
  const { video_id, actor, correlation_id, is_admin } = params;

  if (!is_admin) {
    return {
      ok: false,
      message: "Admin privileges required to unlock script versions",
      error_code: "FORBIDDEN",
    };
  }

  // Get current version
  const currentInfo = await getCurrentScriptVersion(supabase, video_id);

  if (!currentInfo.current_version) {
    return {
      ok: false,
      message: "No script version exists for this video",
      error_code: "NO_SCRIPT",
    };
  }

  if (!currentInfo.is_locked) {
    // Already unlocked - idempotent success
    return {
      ok: true,
      version: currentInfo.current_version,
      message: "Version is already unlocked",
    };
  }

  const previousLockedBy = currentInfo.current_version.locked_by;
  const previousLockedAt = currentInfo.current_version.locked_at;

  // Unlock the version
  const { data: unlockedVersion, error: unlockError } = await supabase
    .from("video_script_versions")
    .update({
      locked_at: null,
      locked_by: null,
    })
    .eq("id", currentInfo.current_version.id)
    .select()
    .single();

  if (unlockError) {
    console.error("Error unlocking version:", unlockError);
    return {
      ok: false,
      message: `Failed to unlock version: ${unlockError.message}`,
      error_code: "DB_ERROR",
    };
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: "script_version_unlocked",
    correlation_id,
    actor,
    details: {
      version_number: unlockedVersion.version_number,
      version_id: unlockedVersion.id,
      content_hash: unlockedVersion.content_hash,
      previous_locked_by: previousLockedBy,
      previous_locked_at: previousLockedAt,
      unlocked_by: actor,
    },
  });

  return {
    ok: true,
    version: unlockedVersion as ScriptVersion,
    message: `Unlocked version ${unlockedVersion.version_number}`,
  };
}

/**
 * Check if a video has a locked script version.
 * Used as a precondition for status transitions.
 */
export async function hasLockedScriptVersion(
  supabase: SupabaseClient,
  video_id: string
): Promise<boolean> {
  const info = await getCurrentScriptVersion(supabase, video_id);
  return info.is_locked;
}

/**
 * Get the locked script version for a video.
 * Returns null if no locked version exists.
 */
export async function getLockedScriptVersion(
  supabase: SupabaseClient,
  video_id: string
): Promise<ScriptVersion | null> {
  const info = await getCurrentScriptVersion(supabase, video_id);
  if (info.is_locked && info.current_version) {
    return info.current_version;
  }
  return null;
}

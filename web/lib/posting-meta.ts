/**
 * posting-meta.ts
 *
 * Posting metadata validation and helpers.
 * Single source of truth for required posting fields.
 *
 * Posting metadata combines:
 * - Script version fields: caption, hashtags, product_sku, product_link, compliance_notes
 * - Video posting_meta JSONB: target_account, uploader_checklist_completed_at
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getLockedScriptVersion, type ScriptVersion } from "./video-script-versions";

// ============================================================================
// Types
// ============================================================================

/**
 * Posting metadata stored in videos.posting_meta JSONB
 */
export interface PostingMeta {
  target_account: string | null;
  uploader_checklist_completed_at?: string | null;
  editor_checklist_completed_at?: string | null;
}

/**
 * Complete posting metadata for ready_to_post gate
 * Combines script version + posting_meta fields
 */
export interface CompletePostingMeta {
  // From locked script version
  product_sku: string | null;
  product_link: string | null;
  caption: string | null;
  hashtags: string[] | null;
  compliance_notes: string | null;
  // From posting_meta JSONB
  target_account: string | null;
  uploader_checklist_completed_at: string | null;
}

/**
 * Required field definition
 */
interface RequiredField {
  key: keyof CompletePostingMeta;
  label: string;
  validate: (value: unknown) => boolean;
}

/**
 * Validation result
 */
export interface PostingMetaValidationResult {
  ok: boolean;
  missing: string[];
  present: string[];
  complete_meta: CompletePostingMeta | null;
}

// ============================================================================
// Required Fields Definition (Single Source of Truth)
// ============================================================================

/**
 * Required fields for ready_to_post transition.
 * This is the single source of truth for posting readiness.
 */
const REQUIRED_POSTING_FIELDS: RequiredField[] = [
  {
    key: "product_sku",
    label: "product_sku",
    validate: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "product_link",
    label: "product_link",
    validate: (v) => {
      if (typeof v !== "string" || v.trim().length === 0) return false;
      // Basic URL validation
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    key: "caption",
    label: "caption",
    validate: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "hashtags",
    label: "hashtags",
    validate: (v) => Array.isArray(v) && v.length > 0 && v.every((h) => typeof h === "string"),
  },
  {
    key: "target_account",
    label: "target_account",
    validate: (v) => typeof v === "string" && v.trim().length > 0,
  },
];

/**
 * Optional fields (not required for gate, but included in metadata)
 */
const OPTIONAL_POSTING_FIELDS: (keyof CompletePostingMeta)[] = [
  "compliance_notes",
  "uploader_checklist_completed_at",
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate posting metadata completeness.
 * This is the single validation function used by both API and status gate.
 *
 * @param meta - Complete posting metadata to validate
 * @returns Validation result with missing/present field lists
 */
export function validatePostingMetaCompleteness(
  meta: Partial<CompletePostingMeta> | null
): PostingMetaValidationResult {
  const missing: string[] = [];
  const present: string[] = [];

  if (!meta) {
    // All required fields are missing
    return {
      ok: false,
      missing: REQUIRED_POSTING_FIELDS.map((f) => f.label),
      present: [],
      complete_meta: null,
    };
  }

  for (const field of REQUIRED_POSTING_FIELDS) {
    const value = meta[field.key];
    if (field.validate(value)) {
      present.push(field.label);
    } else {
      missing.push(field.label);
    }
  }

  // Include optional fields that are present
  for (const key of OPTIONAL_POSTING_FIELDS) {
    const value = meta[key];
    if (value !== null && value !== undefined) {
      present.push(key);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    present,
    complete_meta: missing.length === 0 ? (meta as CompletePostingMeta) : null,
  };
}

/**
 * Validate individual posting_meta fields for POST endpoint.
 * Returns validation errors for invalid fields.
 */
export function validatePostingMetaFields(meta: Partial<PostingMeta>): {
  ok: boolean;
  errors: { field: string; message: string }[];
} {
  const errors: { field: string; message: string }[] = [];

  // Validate target_account if provided
  if (meta.target_account !== undefined && meta.target_account !== null) {
    if (typeof meta.target_account !== "string") {
      errors.push({ field: "target_account", message: "must be a string" });
    } else if (meta.target_account.trim().length === 0) {
      errors.push({ field: "target_account", message: "cannot be empty" });
    }
  }

  // Validate uploader_checklist_completed_at if provided
  if (meta.uploader_checklist_completed_at !== undefined && meta.uploader_checklist_completed_at !== null) {
    if (typeof meta.uploader_checklist_completed_at !== "string") {
      errors.push({ field: "uploader_checklist_completed_at", message: "must be a string (ISO timestamp)" });
    } else {
      // Validate it's a valid ISO date
      const date = new Date(meta.uploader_checklist_completed_at);
      if (isNaN(date.getTime())) {
        errors.push({ field: "uploader_checklist_completed_at", message: "must be a valid ISO timestamp" });
      }
    }
  }

  // Validate editor_checklist_completed_at if provided
  if (meta.editor_checklist_completed_at !== undefined && meta.editor_checklist_completed_at !== null) {
    if (typeof meta.editor_checklist_completed_at !== "string") {
      errors.push({ field: "editor_checklist_completed_at", message: "must be a string (ISO timestamp)" });
    } else {
      // Validate it's a valid ISO date
      const date = new Date(meta.editor_checklist_completed_at);
      if (isNaN(date.getTime())) {
        errors.push({ field: "editor_checklist_completed_at", message: "must be a valid ISO timestamp" });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Data Access Functions
// ============================================================================

/**
 * Get complete posting metadata for a video.
 * Combines locked script version fields + posting_meta JSONB.
 */
export async function getCompletePostingMeta(
  supabase: SupabaseClient,
  video_id: string
): Promise<{
  ok: boolean;
  meta: CompletePostingMeta | null;
  locked_script: ScriptVersion | null;
  posting_meta: PostingMeta | null;
  error?: string;
}> {
  // Fetch video with posting_meta
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, posting_meta")
    .eq("id", video_id)
    .single();

  if (videoError || !video) {
    return {
      ok: false,
      meta: null,
      locked_script: null,
      posting_meta: null,
      error: "Video not found",
    };
  }

  // Get locked script version
  const lockedScript = await getLockedScriptVersion(supabase, video_id);

  // Parse posting_meta
  const postingMeta = video.posting_meta as PostingMeta | null;

  // Combine into complete metadata
  const completeMeta: CompletePostingMeta = {
    // From locked script (or null if no locked script)
    product_sku: lockedScript?.product_sku || null,
    product_link: lockedScript?.product_link || null,
    caption: lockedScript?.caption || null,
    hashtags: lockedScript?.hashtags || null,
    compliance_notes: lockedScript?.compliance_notes || null,
    // From posting_meta JSONB
    target_account: postingMeta?.target_account || null,
    uploader_checklist_completed_at: postingMeta?.uploader_checklist_completed_at || null,
  };

  return {
    ok: true,
    meta: completeMeta,
    locked_script: lockedScript,
    posting_meta: postingMeta,
  };
}

/**
 * Update posting metadata for a video.
 * Merges with existing posting_meta JSONB.
 */
export async function updatePostingMeta(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    updates: Partial<PostingMeta>;
    actor: string;
    correlation_id: string;
  }
): Promise<{
  ok: boolean;
  posting_meta: PostingMeta | null;
  changed_fields: string[];
  error?: string;
}> {
  const { video_id, updates, actor, correlation_id } = params;

  // Fetch current video
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, posting_meta")
    .eq("id", video_id)
    .single();

  if (fetchError || !video) {
    return {
      ok: false,
      posting_meta: null,
      changed_fields: [],
      error: "Video not found",
    };
  }

  // Merge with existing posting_meta
  const currentMeta = (video.posting_meta as PostingMeta) || {};
  const newMeta: PostingMeta = {
    target_account: updates.target_account !== undefined ? updates.target_account : currentMeta.target_account || null,
    uploader_checklist_completed_at:
      updates.uploader_checklist_completed_at !== undefined
        ? updates.uploader_checklist_completed_at
        : currentMeta.uploader_checklist_completed_at || null,
    editor_checklist_completed_at:
      updates.editor_checklist_completed_at !== undefined
        ? updates.editor_checklist_completed_at
        : currentMeta.editor_checklist_completed_at || null,
  };

  // Determine what changed
  const changedFields: string[] = [];
  if (updates.target_account !== undefined && updates.target_account !== currentMeta.target_account) {
    changedFields.push("target_account");
  }
  if (
    updates.uploader_checklist_completed_at !== undefined &&
    updates.uploader_checklist_completed_at !== currentMeta.uploader_checklist_completed_at
  ) {
    changedFields.push("uploader_checklist_completed_at");
  }
  if (
    updates.editor_checklist_completed_at !== undefined &&
    updates.editor_checklist_completed_at !== currentMeta.editor_checklist_completed_at
  ) {
    changedFields.push("editor_checklist_completed_at");
  }

  // Update the video
  const { error: updateError } = await supabase
    .from("videos")
    .update({ posting_meta: newMeta })
    .eq("id", video_id);

  if (updateError) {
    return {
      ok: false,
      posting_meta: null,
      changed_fields: [],
      error: `Database error: ${updateError.message}`,
    };
  }

  // Write audit event if anything changed
  if (changedFields.length > 0) {
    try {
      await supabase.from("video_events").insert({
        video_id,
        event_type: "posting_meta_updated",
        correlation_id,
        actor,
        from_status: null,
        to_status: null,
        details: {
          changed_fields: changedFields,
          previous_meta: currentMeta,
          new_meta: newMeta,
        },
      });
    } catch (err) {
      console.error("Failed to write posting_meta_updated event:", err);
    }
  }

  return {
    ok: true,
    posting_meta: newMeta,
    changed_fields: changedFields,
  };
}

/**
 * Get list of required fields for documentation/API responses.
 */
export function getRequiredPostingFields(): string[] {
  return REQUIRED_POSTING_FIELDS.map((f) => f.label);
}

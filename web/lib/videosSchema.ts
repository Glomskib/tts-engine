import { supabaseAdmin } from "./supabaseAdmin";

let cachedColumns: Set<string> | null = null;

// Base known columns from migrations - CONSERVATIVE fallback (only includes widely-applied migrations)
// This fallback is used when information_schema query fails - keep it minimal to avoid errors
function getKnownColumns(): Set<string> {
  return new Set([
    // Base columns
    "id", "variant_id", "google_drive_url", "status", "created_at", "updated_at",
    "product_id", "concept_id", "script_id", "account_id",
    "uploaded_to_tiktok", "tiktok_video_id", "views", "clicks", "orders", "revenue",
    "virality_score", "compliance_score", "uploaded_at", "final_video_url",
    "caption_used", "hashtags_used", "tt_post_url", "posted_at",
    // Migration 010: Claim columns
    "claimed_by", "claimed_at", "claim_expires_at",
    // Migration 011: Script lock columns
    "script_locked_json", "script_locked_text", "script_locked_version",
    // Migration 014: Execution tracking columns
    "recording_status", "recorded_at", "edited_at", "ready_to_post_at",
    "rejected_at", "recording_notes", "editor_notes", "uploader_notes",
    "posted_url", "posted_platform", "posted_account", "posted_at_local",
    "posting_error", "last_status_changed_at",
    // NOTE: claim_role (migration 015) is NOT included here as it's new
    // The code checks for it dynamically via information_schema
  ]);
}

export async function getVideosColumns(): Promise<Set<string>> {
  if (cachedColumns) {
    return cachedColumns;
  }

  try {
    // Start with known columns
    const columns = getKnownColumns();

    // Explicitly check for claim_role column (migration 015)
    // We can't rely on select * because Supabase may omit null columns
    const { error: claimRoleError } = await supabaseAdmin
      .from("videos")
      .select("claim_role")
      .limit(1);

    if (!claimRoleError) {
      // claim_role column exists
      columns.add("claim_role");
    }

    cachedColumns = columns;
  } catch (err) {
    console.error("Error querying videos schema:", err);
    // Fallback to known columns from migrations
    cachedColumns = getKnownColumns();
  }

  return cachedColumns;
}

export function clearVideosSchemaCache(): void {
  cachedColumns = null;
}

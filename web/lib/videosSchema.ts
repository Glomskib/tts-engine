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
    // Get actual columns by selecting one row with select *
    // This works because Supabase returns the actual table columns
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Failed to fetch videos schema:", error);
      // Fallback to known columns from migrations
      cachedColumns = getKnownColumns();
    } else if (data && data.length > 0) {
      // Extract column names from the returned row
      cachedColumns = new Set(Object.keys(data[0]));
    } else {
      // No rows exist - try selecting with specific columns to verify they exist
      // Fall back to known columns but don't cache to allow retry
      return getKnownColumns();
    }
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

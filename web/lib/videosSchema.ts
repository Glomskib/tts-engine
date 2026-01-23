import { supabaseAdmin } from "./supabaseAdmin";

let cachedColumns: Set<string> | null = null;

// All known columns from migrations - update when adding new migrations
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
  ]);
}

export async function getVideosColumns(): Promise<Set<string>> {
  if (cachedColumns) {
    return cachedColumns;
  }

  try {
    // Query information_schema to get actual columns
    const { data, error } = await supabaseAdmin
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_name", "videos")
      .eq("table_schema", "public");

    if (error) {
      console.error("Failed to fetch videos schema:", error);
      // Fallback to all known columns from migrations
      cachedColumns = getKnownColumns();
    } else {
      cachedColumns = new Set(data.map((row: any) => row.column_name));
    }
  } catch (err) {
    console.error("Error querying videos schema:", err);
    // Fallback to all known columns from migrations
    cachedColumns = getKnownColumns();
  }

  return cachedColumns;
}

export function clearVideosSchemaCache(): void {
  cachedColumns = null;
}

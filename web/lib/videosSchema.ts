import { supabaseAdmin } from "./supabaseAdmin";

let cachedColumns: Set<string> | null = null;

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
      // Fallback to known columns
      cachedColumns = new Set(["id", "variant_id", "google_drive_url", "status", "created_at", "updated_at"]);
    } else {
      cachedColumns = new Set(data.map((row: any) => row.column_name));
    }
  } catch (err) {
    console.error("Error querying videos schema:", err);
    // Fallback to known columns
    cachedColumns = new Set(["id", "variant_id", "google_drive_url", "status", "created_at", "updated_at"]);
  }

  return cachedColumns;
}

export function clearVideosSchemaCache(): void {
  cachedColumns = null;
}

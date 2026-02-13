/**
 * Video Activity Logger
 *
 * Logs status changes and events to the video_events audit table.
 * Non-blocking — activity logging should never break the main flow.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export async function logVideoActivity(
  supabase: SupabaseClient,
  videoId: string,
  eventType: string,
  fromStatus: string | null,
  toStatus: string | null,
  actor: string = "system",
  details: string | null = null,
  correlationId?: string | null
) {
  try {
    await supabase.from("video_events").insert({
      video_id: videoId,
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      actor,
      details: details ? { message: details } : {},
      correlation_id: correlationId || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Activity log failed (non-blocking):", e);
  }
}

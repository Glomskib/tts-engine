/**
 * events-log.ts
 *
 * Centralized utility for writing to the events_log table.
 * Use this for all org-level, user-level, and system events.
 *
 * DO NOT use video_events for non-video entities (video_id is NOT NULL).
 */

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Valid entity types for events_log table.
 * Each entity type has its own set of event_type values.
 */
export type EventsLogEntityType =
  | "client_org"
  | "client_request"
  | "client_project"
  | "user"
  | "email"
  | "system"
  | "invite"
  | "ingestion_job"
  | "enrichment_worker";

/**
 * Arguments for logging an event to events_log.
 */
export interface LogEventArgs {
  entity_type: EventsLogEntityType;
  entity_id: string;
  event_type: string;
  payload?: Record<string, unknown>;
}

/**
 * Log an event to the events_log table.
 *
 * @param supabase - Supabase client (typically supabaseAdmin for server-side)
 * @param args - Event details
 * @throws Error if insert fails
 *
 * @example
 * await logEvent(supabaseAdmin, {
 *   entity_type: "client_org",
 *   entity_id: orgId,
 *   event_type: "client_org_created",
 *   payload: { org_name: "Acme Corp", created_by_user_id: userId },
 * });
 */
export async function logEvent(
  supabase: SupabaseClient,
  args: LogEventArgs
): Promise<void> {
  const { entity_type, entity_id, event_type, payload } = args;

  const { error } = await supabase.from("events_log").insert({
    entity_type,
    entity_id,
    event_type,
    payload: payload ?? {},
  });

  if (error) {
    console.error(`Failed to log event ${event_type}:`, error);
    throw error;
  }
}

/**
 * Log an event to events_log, but don't throw on failure.
 * Use this for non-critical audit events where failure shouldn't break the flow.
 *
 * @param supabase - Supabase client
 * @param args - Event details
 * @returns true if successful, false if failed
 */
export async function logEventSafe(
  supabase: SupabaseClient,
  args: LogEventArgs
): Promise<boolean> {
  try {
    await logEvent(supabase, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Client Requests Module
 *
 * Event-based intake system for client content requests.
 * Supports AI_CONTENT (brief only) and UGC_EDIT (footage required) request types.
 *
 * Event types (video_id null for org-level events):
 * - client_request_submitted: New request created
 * - client_request_status_set: Status change (IN_REVIEW, APPROVED, REJECTED)
 * - client_request_converted: Request converted to pipeline video
 * - client_request_priority_set: Priority change (LOW, NORMAL, HIGH)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

export type RequestType = "AI_CONTENT" | "UGC_EDIT";

export type RequestStatus =
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED";

export type RequestPriority = "LOW" | "NORMAL" | "HIGH";

export interface ClientRequestSubmission {
  org_id: string;
  project_id?: string;
  request_type: RequestType;
  title: string;
  brief: string;
  product_url?: string;
  ugc_links?: string[];
  notes?: string;
  requested_by_user_id: string;
  requested_by_email?: string;
}

export interface ClientRequestDetails extends ClientRequestSubmission {
  request_id: string;
}

export interface ClientRequest {
  request_id: string;
  org_id: string;
  project_id?: string;
  request_type: RequestType;
  title: string;
  brief: string;
  product_url?: string;
  ugc_links?: string[];
  notes?: string;
  requested_by_user_id: string;
  requested_by_email?: string;
  status: RequestStatus;
  status_reason?: string;
  video_id?: string;
  priority: RequestPriority;
  created_at: string;
  updated_at: string;
}

/**
 * SLA timing metadata for a request.
 * All timestamps are ISO strings, durations in milliseconds.
 */
export interface RequestSLATiming {
  submitted_at: string;
  first_admin_action_at: string | null;
  converted_at: string | null;
  time_to_first_action_ms: number | null;
  time_to_conversion_ms: number | null;
  current_age_ms: number;
}

// ============================================================================
// Event Type Constants
// ============================================================================

export const REQUEST_EVENT_TYPES = {
  SUBMITTED: "client_request_submitted",
  STATUS_SET: "client_request_status_set",
  CONVERTED: "client_request_converted",
  PRIORITY_SET: "client_request_priority_set",
} as const;

// ============================================================================
// SLA Thresholds (Constants - Not Stored)
// ============================================================================

/**
 * SLA thresholds by priority in milliseconds.
 * Requests exceeding these are considered breached.
 */
export const SLA_THRESHOLDS_MS: Record<RequestPriority, number> = {
  LOW: 72 * 60 * 60 * 1000,    // 72 hours
  NORMAL: 48 * 60 * 60 * 1000, // 48 hours
  HIGH: 24 * 60 * 60 * 1000,   // 24 hours
};

/**
 * Warning threshold as percentage of SLA.
 * At 80% of SLA, status becomes WARNING.
 */
export const SLA_WARNING_THRESHOLD = 0.8;

/**
 * SLA status for a request.
 * - OK: Within SLA
 * - WARNING: Within 20% of breach
 * - BREACHED: Past SLA threshold
 */
export type SLAStatus = "OK" | "WARNING" | "BREACHED";

// ============================================================================
// SLA Breach Detection Helpers
// ============================================================================

/**
 * Check if a request has breached its SLA.
 * Pure computation - no persistence.
 *
 * @param request - The client request
 * @param now - Current timestamp in milliseconds
 * @returns true if SLA is breached
 */
export function isRequestSLABreached(
  request: ClientRequest,
  now: number = Date.now()
): boolean {
  // Completed requests are never breached
  if (request.status === "CONVERTED" || request.status === "REJECTED") {
    return false;
  }

  const submittedAt = new Date(request.created_at).getTime();
  const ageMs = now - submittedAt;
  const threshold = SLA_THRESHOLDS_MS[request.priority || "NORMAL"];

  return ageMs > threshold;
}

/**
 * Get the SLA status for a request.
 * Pure computation - no persistence.
 *
 * @param request - The client request
 * @param now - Current timestamp in milliseconds
 * @returns SLA status: OK, WARNING, or BREACHED
 */
export function getRequestSLAStatus(
  request: ClientRequest,
  now: number = Date.now()
): SLAStatus {
  // Completed requests are always OK
  if (request.status === "CONVERTED" || request.status === "REJECTED") {
    return "OK";
  }

  const submittedAt = new Date(request.created_at).getTime();
  const ageMs = now - submittedAt;
  const threshold = SLA_THRESHOLDS_MS[request.priority || "NORMAL"];

  if (ageMs > threshold) {
    return "BREACHED";
  }

  if (ageMs > threshold * SLA_WARNING_THRESHOLD) {
    return "WARNING";
  }

  return "OK";
}

/**
 * Get time remaining until SLA breach.
 * Returns negative value if already breached.
 *
 * @param request - The client request
 * @param now - Current timestamp in milliseconds
 * @returns Milliseconds until breach (negative if breached)
 */
export function getTimeUntilSLABreach(
  request: ClientRequest,
  now: number = Date.now()
): number {
  const submittedAt = new Date(request.created_at).getTime();
  const threshold = SLA_THRESHOLDS_MS[request.priority || "NORMAL"];
  const breachTime = submittedAt + threshold;

  return breachTime - now;
}

// ============================================================================
// Resolvers
// ============================================================================

/**
 * Create a new client request.
 * Writes a submitted event with a new request_id.
 */
export async function createClientRequest(
  supabase: SupabaseClient,
  submission: ClientRequestSubmission
): Promise<{ request_id: string }> {
  const request_id = randomUUID();

  const details: ClientRequestDetails = {
    request_id,
    ...submission,
  };

  const { error } = await supabase.from("video_events").insert({
    video_id: null,
    event_type: REQUEST_EVENT_TYPES.SUBMITTED,
    actor_id: submission.requested_by_user_id,
    details,
  });

  if (error) {
    console.error("[client-requests] Error creating request:", error);
    throw new Error("Failed to create request");
  }

  return { request_id };
}

/**
 * Set the status of a client request.
 * Writes a status_set event.
 */
export async function setClientRequestStatus(
  supabase: SupabaseClient,
  params: {
    request_id: string;
    org_id: string;
    status: "IN_REVIEW" | "APPROVED" | "REJECTED";
    reason?: string;
    actor_user_id: string;
  }
): Promise<void> {
  const { error } = await supabase.from("video_events").insert({
    video_id: null,
    event_type: REQUEST_EVENT_TYPES.STATUS_SET,
    actor_id: params.actor_user_id,
    details: {
      request_id: params.request_id,
      org_id: params.org_id,
      status: params.status,
      reason: params.reason,
      actor_user_id: params.actor_user_id,
    },
  });

  if (error) {
    console.error("[client-requests] Error setting status:", error);
    throw new Error("Failed to set request status");
  }
}

/**
 * Mark a request as converted to a video.
 * Writes a converted event with the video_id.
 */
export async function convertClientRequestToVideo(
  supabase: SupabaseClient,
  params: {
    request_id: string;
    org_id: string;
    video_id: string;
    actor_user_id: string;
  }
): Promise<void> {
  const { error } = await supabase.from("video_events").insert({
    video_id: null,
    event_type: REQUEST_EVENT_TYPES.CONVERTED,
    actor_id: params.actor_user_id,
    details: {
      request_id: params.request_id,
      org_id: params.org_id,
      video_id: params.video_id,
      actor_user_id: params.actor_user_id,
    },
  });

  if (error) {
    console.error("[client-requests] Error converting request:", error);
    throw new Error("Failed to record request conversion");
  }
}

/**
 * List client requests for an organization.
 * Resolves latest status for each request.
 */
export async function listClientRequestsForOrg(
  supabase: SupabaseClient,
  orgId: string,
  filters?: {
    project_id?: string;
    status?: RequestStatus;
  }
): Promise<ClientRequest[]> {
  // Get all submitted events
  const { data: submittedEvents, error: submittedError } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.SUBMITTED)
    .is("video_id", null)
    .order("created_at", { ascending: false });

  if (submittedError) {
    console.error("[client-requests] Error fetching submitted events:", submittedError);
    return [];
  }

  // Filter to this org's requests
  const orgSubmissions = (submittedEvents || []).filter(
    (e) => e.details?.org_id === orgId
  );

  if (orgSubmissions.length === 0) {
    return [];
  }

  // Get all status events for this org
  const { data: statusEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.STATUS_SET)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Get all converted events for this org
  const { data: convertedEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.CONVERTED)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Build request objects with latest status
  const requests: ClientRequest[] = [];

  for (const submission of orgSubmissions) {
    const details = submission.details as ClientRequestDetails;
    const requestId = details.request_id;

    // Apply project filter if specified
    if (filters?.project_id && details.project_id !== filters.project_id) {
      continue;
    }

    // Find latest status
    let status: RequestStatus = "SUBMITTED";
    let statusReason: string | undefined;
    let videoId: string | undefined;
    let updatedAt = submission.created_at;

    // Check status events
    const requestStatusEvents = (statusEvents || []).filter(
      (e) => e.details?.request_id === requestId && e.details?.org_id === orgId
    );

    for (const statusEvent of requestStatusEvents) {
      status = statusEvent.details?.status as RequestStatus;
      statusReason = statusEvent.details?.reason;
      updatedAt = statusEvent.created_at;
    }

    // Check converted events
    const requestConvertedEvents = (convertedEvents || []).filter(
      (e) => e.details?.request_id === requestId && e.details?.org_id === orgId
    );

    if (requestConvertedEvents.length > 0) {
      status = "CONVERTED";
      videoId = requestConvertedEvents[requestConvertedEvents.length - 1].details?.video_id;
      updatedAt = requestConvertedEvents[requestConvertedEvents.length - 1].created_at;
    }

    // Apply status filter if specified
    if (filters?.status && status !== filters.status) {
      continue;
    }

    requests.push({
      request_id: requestId,
      org_id: details.org_id,
      project_id: details.project_id,
      request_type: details.request_type,
      title: details.title,
      brief: details.brief,
      product_url: details.product_url,
      ugc_links: details.ugc_links,
      notes: details.notes,
      requested_by_user_id: details.requested_by_user_id,
      requested_by_email: details.requested_by_email,
      status,
      status_reason: statusReason,
      video_id: videoId,
      priority: "NORMAL" as RequestPriority, // Priority resolved separately via getRequestPriorities
      created_at: submission.created_at,
      updated_at: updatedAt,
    });
  }

  return requests;
}

/**
 * Get a single client request by ID.
 * Returns null if not found or not in the specified org.
 */
export async function getClientRequestById(
  supabase: SupabaseClient,
  orgId: string,
  requestId: string
): Promise<ClientRequest | null> {
  // Get the submitted event for this request
  const { data: submittedEvents, error } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.SUBMITTED)
    .is("video_id", null)
    .order("created_at", { ascending: false });

  if (error || !submittedEvents) {
    return null;
  }

  // Find the specific request
  const submission = submittedEvents.find(
    (e) => e.details?.request_id === requestId && e.details?.org_id === orgId
  );

  if (!submission) {
    return null;
  }

  const details = submission.details as ClientRequestDetails;

  // Get status events for this request
  const { data: statusEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.STATUS_SET)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Get converted events for this request
  const { data: convertedEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.CONVERTED)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Resolve latest status
  let status: RequestStatus = "SUBMITTED";
  let statusReason: string | undefined;
  let videoId: string | undefined;
  let updatedAt = submission.created_at;

  const requestStatusEvents = (statusEvents || []).filter(
    (e) => e.details?.request_id === requestId && e.details?.org_id === orgId
  );

  for (const statusEvent of requestStatusEvents) {
    status = statusEvent.details?.status as RequestStatus;
    statusReason = statusEvent.details?.reason;
    updatedAt = statusEvent.created_at;
  }

  const requestConvertedEvents = (convertedEvents || []).filter(
    (e) => e.details?.request_id === requestId && e.details?.org_id === orgId
  );

  if (requestConvertedEvents.length > 0) {
    status = "CONVERTED";
    videoId = requestConvertedEvents[requestConvertedEvents.length - 1].details?.video_id;
    updatedAt = requestConvertedEvents[requestConvertedEvents.length - 1].created_at;
  }

  return {
    request_id: requestId,
    org_id: details.org_id,
    project_id: details.project_id,
    request_type: details.request_type,
    title: details.title,
    brief: details.brief,
    product_url: details.product_url,
    ugc_links: details.ugc_links,
    notes: details.notes,
    requested_by_user_id: details.requested_by_user_id,
    requested_by_email: details.requested_by_email,
    status,
    status_reason: statusReason,
    video_id: videoId,
    priority: "NORMAL" as RequestPriority, // Priority resolved separately via getRequestPriority
    created_at: submission.created_at,
    updated_at: updatedAt,
  };
}

/**
 * List all client requests (admin view).
 * Returns requests across all orgs with optional filters.
 */
export async function listAllClientRequests(
  supabase: SupabaseClient,
  filters?: {
    org_id?: string;
    status?: RequestStatus;
    request_type?: RequestType;
  }
): Promise<ClientRequest[]> {
  // Get all submitted events
  const { data: submittedEvents, error: submittedError } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.SUBMITTED)
    .is("video_id", null)
    .order("created_at", { ascending: false });

  if (submittedError || !submittedEvents) {
    console.error("[client-requests] Error fetching all requests:", submittedError);
    return [];
  }

  // Get all status events
  const { data: statusEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.STATUS_SET)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Get all converted events
  const { data: convertedEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.CONVERTED)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  const requests: ClientRequest[] = [];

  for (const submission of submittedEvents) {
    const details = submission.details as ClientRequestDetails;
    if (!details?.request_id) continue;

    const requestId = details.request_id;

    // Apply org filter
    if (filters?.org_id && details.org_id !== filters.org_id) {
      continue;
    }

    // Apply request_type filter
    if (filters?.request_type && details.request_type !== filters.request_type) {
      continue;
    }

    // Find latest status
    let status: RequestStatus = "SUBMITTED";
    let statusReason: string | undefined;
    let videoId: string | undefined;
    let updatedAt = submission.created_at;

    const requestStatusEvents = (statusEvents || []).filter(
      (e) => e.details?.request_id === requestId
    );

    for (const statusEvent of requestStatusEvents) {
      status = statusEvent.details?.status as RequestStatus;
      statusReason = statusEvent.details?.reason;
      updatedAt = statusEvent.created_at;
    }

    const requestConvertedEvents = (convertedEvents || []).filter(
      (e) => e.details?.request_id === requestId
    );

    if (requestConvertedEvents.length > 0) {
      status = "CONVERTED";
      videoId = requestConvertedEvents[requestConvertedEvents.length - 1].details?.video_id;
      updatedAt = requestConvertedEvents[requestConvertedEvents.length - 1].created_at;
    }

    // Apply status filter
    if (filters?.status && status !== filters.status) {
      continue;
    }

    requests.push({
      request_id: requestId,
      org_id: details.org_id,
      project_id: details.project_id,
      request_type: details.request_type,
      title: details.title,
      brief: details.brief,
      product_url: details.product_url,
      ugc_links: details.ugc_links,
      notes: details.notes,
      requested_by_user_id: details.requested_by_user_id,
      requested_by_email: details.requested_by_email,
      status,
      status_reason: statusReason,
      video_id: videoId,
      priority: "NORMAL" as RequestPriority, // Priority resolved separately via getRequestPriorities
      created_at: submission.created_at,
      updated_at: updatedAt,
    });
  }

  return requests;
}

/**
 * Get a single request by ID (admin view, no org restriction).
 */
export async function getClientRequestByIdAdmin(
  supabase: SupabaseClient,
  requestId: string
): Promise<ClientRequest | null> {
  // Get the submitted event for this request
  const { data: submittedEvents, error } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.SUBMITTED)
    .is("video_id", null);

  if (error || !submittedEvents) {
    return null;
  }

  const submission = submittedEvents.find(
    (e) => e.details?.request_id === requestId
  );

  if (!submission) {
    return null;
  }

  const details = submission.details as ClientRequestDetails;

  // Get status events
  const { data: statusEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.STATUS_SET)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Get converted events
  const { data: convertedEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.CONVERTED)
    .is("video_id", null);

  let status: RequestStatus = "SUBMITTED";
  let statusReason: string | undefined;
  let videoId: string | undefined;
  let updatedAt = submission.created_at;

  const requestStatusEvents = (statusEvents || []).filter(
    (e) => e.details?.request_id === requestId
  );

  for (const statusEvent of requestStatusEvents) {
    status = statusEvent.details?.status as RequestStatus;
    statusReason = statusEvent.details?.reason;
    updatedAt = statusEvent.created_at;
  }

  const requestConvertedEvents = (convertedEvents || []).filter(
    (e) => e.details?.request_id === requestId
  );

  if (requestConvertedEvents.length > 0) {
    status = "CONVERTED";
    videoId = requestConvertedEvents[requestConvertedEvents.length - 1].details?.video_id;
    updatedAt = requestConvertedEvents[requestConvertedEvents.length - 1].created_at;
  }

  return {
    request_id: requestId,
    org_id: details.org_id,
    project_id: details.project_id,
    request_type: details.request_type,
    title: details.title,
    brief: details.brief,
    product_url: details.product_url,
    ugc_links: details.ugc_links,
    notes: details.notes,
    requested_by_user_id: details.requested_by_user_id,
    requested_by_email: details.requested_by_email,
    status,
    status_reason: statusReason,
    video_id: videoId,
    priority: "NORMAL" as RequestPriority, // Priority resolved separately via getRequestPriority
    created_at: submission.created_at,
    updated_at: updatedAt,
  };
}

// ============================================================================
// Priority Functions
// ============================================================================

/**
 * Set the priority of a client request.
 * Writes a priority_set event.
 */
export async function setClientRequestPriority(
  supabase: SupabaseClient,
  params: {
    request_id: string;
    org_id: string;
    priority: RequestPriority;
    actor_user_id: string;
  }
): Promise<void> {
  const { error } = await supabase.from("video_events").insert({
    video_id: null,
    event_type: REQUEST_EVENT_TYPES.PRIORITY_SET,
    actor_id: params.actor_user_id,
    details: {
      request_id: params.request_id,
      org_id: params.org_id,
      priority: params.priority,
      actor_user_id: params.actor_user_id,
    },
  });

  if (error) {
    console.error("[client-requests] Error setting priority:", error);
    throw new Error("Failed to set request priority");
  }
}

/**
 * Get the current priority for a request.
 * Returns NORMAL if no priority event exists.
 */
export async function getRequestPriority(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestPriority> {
  const { data: priorityEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.PRIORITY_SET)
    .is("video_id", null)
    .order("created_at", { ascending: false });

  if (!priorityEvents) {
    return "NORMAL";
  }

  // Find latest priority event for this request
  const latestPriority = priorityEvents.find(
    (e) => e.details?.request_id === requestId
  );

  if (!latestPriority) {
    return "NORMAL";
  }

  return (latestPriority.details?.priority as RequestPriority) || "NORMAL";
}

/**
 * Get priorities for multiple requests at once (batch lookup).
 */
export async function getRequestPriorities(
  supabase: SupabaseClient,
  requestIds: string[]
): Promise<Map<string, RequestPriority>> {
  const priorities = new Map<string, RequestPriority>();

  // Initialize all to NORMAL
  for (const id of requestIds) {
    priorities.set(id, "NORMAL");
  }

  if (requestIds.length === 0) {
    return priorities;
  }

  const { data: priorityEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.PRIORITY_SET)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  if (!priorityEvents) {
    return priorities;
  }

  // Process in chronological order so latest wins
  for (const event of priorityEvents) {
    const reqId = event.details?.request_id;
    if (reqId && requestIds.includes(reqId)) {
      priorities.set(reqId, (event.details?.priority as RequestPriority) || "NORMAL");
    }
  }

  return priorities;
}

// ============================================================================
// SLA Timing Functions
// ============================================================================

/**
 * Calculate SLA timing for a request.
 * All times derived from events.
 */
export async function getRequestSLATiming(
  supabase: SupabaseClient,
  requestId: string,
  submittedAt: string
): Promise<RequestSLATiming> {
  const now = Date.now();
  const submittedTime = new Date(submittedAt).getTime();

  // Get status events for first admin action
  const { data: statusEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.STATUS_SET)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Get converted events
  const { data: convertedEvents } = await supabase
    .from("video_events")
    .select("details, created_at")
    .eq("event_type", REQUEST_EVENT_TYPES.CONVERTED)
    .is("video_id", null)
    .order("created_at", { ascending: true });

  // Find first admin action (status change)
  let firstAdminActionAt: string | null = null;
  const requestStatusEvents = (statusEvents || []).filter(
    (e) => e.details?.request_id === requestId
  );
  if (requestStatusEvents.length > 0) {
    firstAdminActionAt = requestStatusEvents[0].created_at;
  }

  // Find conversion time
  let convertedAt: string | null = null;
  const requestConvertedEvents = (convertedEvents || []).filter(
    (e) => e.details?.request_id === requestId
  );
  if (requestConvertedEvents.length > 0) {
    convertedAt = requestConvertedEvents[0].created_at;
  }

  // Calculate durations
  const timeToFirstActionMs = firstAdminActionAt
    ? new Date(firstAdminActionAt).getTime() - submittedTime
    : null;

  const timeToConversionMs = convertedAt
    ? new Date(convertedAt).getTime() - submittedTime
    : null;

  const currentAgeMs = now - submittedTime;

  return {
    submitted_at: submittedAt,
    first_admin_action_at: firstAdminActionAt,
    converted_at: convertedAt,
    time_to_first_action_ms: timeToFirstActionMs,
    time_to_conversion_ms: timeToConversionMs,
    current_age_ms: currentAgeMs,
  };
}

/**
 * Format duration in milliseconds to human-readable string.
 * e.g., "2h 14m" or "3d 5h"
 */
export function formatDurationMs(ms: number): string {
  if (ms < 0) return "0m";

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

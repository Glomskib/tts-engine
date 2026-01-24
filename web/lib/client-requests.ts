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
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Event Type Constants
// ============================================================================

export const REQUEST_EVENT_TYPES = {
  SUBMITTED: "client_request_submitted",
  STATUS_SET: "client_request_status_set",
  CONVERTED: "client_request_converted",
} as const;

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
    created_at: submission.created_at,
    updated_at: updatedAt,
  };
}

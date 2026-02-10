/**
 * POST /api/videos/[id]/release
 *
 * Atomically release a video claim.
 *
 * Properties:
 * - Atomic: uses single UPDATE WHERE to prevent race conditions
 * - Idempotent: releasing an unclaimed video is a no-op success
 * - Safe: only claim owner (or admin with force) can release
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atomicReleaseVideo } from "@/lib/video-claim";
import { generateCorrelationId, isAdminUser, createApiErrorResponse, type ApiErrorCode } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { checkIncidentReadOnlyBlock } from "@/lib/settings";
import { auditLogAsync, AuditEventTypes, EntityTypes } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Validate video ID
  if (!id || typeof id !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "Video ID is required", 400, correlationId);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return createApiErrorResponse("INVALID_UUID", "Video ID must be a valid UUID", 400, correlationId, { provided: id });
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  // Support both claimed_by (legacy) and released_by (preferred)
  const { claimed_by, released_by, force } = body as Record<string, unknown>;

  // Get authentication context from session
  const authContext = await getApiAuthContext(request);

  // Determine actor: prefer authenticated user, fallback to legacy fields for tests
  const isAuthenticated = authContext.user !== null;
  const actor = authContext.user
    ? authContext.user.id
    : (typeof released_by === "string" && released_by.trim() !== "" ? released_by.trim()
      : typeof claimed_by === "string" && claimed_by.trim() !== "" ? claimed_by.trim()
      : null);

  if (!actor) {
    return createApiErrorResponse(
      "MISSING_ACTOR",
      "Authentication required. Please sign in to release claims.",
      401,
      correlationId,
      { hint: "Sign in or provide released_by in request body for test mode" }
    );
  }

  const forceRequested = force === true;
  // Admin check: prefer authenticated role, fallback to legacy ADMIN_USERS check for tests
  const isAdmin = isAuthenticated ? authContext.isAdmin : isAdminUser(actor);

  // Force is only allowed for admin users
  if (forceRequested && !isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "force=true is only allowed for admin users",
      403,
      correlationId,
      { actor, hint: "Only authenticated admin users can use force" }
    );
  }

  // Incident mode read-only check (admin bypass)
  const incidentCheck = await checkIncidentReadOnlyBlock(actor, isAdmin);
  if (incidentCheck.blocked) {
    return createApiErrorResponse(
      "CONFLICT",
      incidentCheck.message || "System is in maintenance mode.",
      503,
      correlationId,
      { reason: "incident_mode_read_only" }
    );
  }

  try {
    // Execute atomic release
    const result = await atomicReleaseVideo(supabaseAdmin, {
      video_id: id,
      actor,
      force: forceRequested,
      is_admin: isAdmin,
      correlation_id: correlationId,
    });

    if (!result.ok) {
      // Map result to appropriate HTTP error
      const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
        NOT_FOUND: { code: "NOT_FOUND", status: 404 },
        NOT_CLAIM_OWNER: { code: "NOT_CLAIM_OWNER", status: 403 },
        RACE_CONDITION: { code: "CONFLICT", status: 409 },
        DB_ERROR: { code: "DB_ERROR", status: 500 },
      };

      const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
      return createApiErrorResponse(errorInfo.code, result.message, errorInfo.status, correlationId, {
        current_claimed_by: result.previous_claimed_by,
        actor,
      });
    }

    // Fetch full video data for response
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("id,variant_id,account_id,status,google_drive_url,created_at,claimed_by,claimed_at,claim_expires_at,claim_role")
      .eq("id", id)
      .single();

    // Audit log for release
    auditLogAsync({
      correlation_id: correlationId,
      event_type: AuditEventTypes.VIDEO_RELEASED,
      entity_type: EntityTypes.VIDEO,
      entity_id: id,
      actor: actor,
      summary: `Video ${id} released by ${actor}`,
      details: {
        action: result.action,
        previous_claimed_by: result.previous_claimed_by,
        force: forceRequested,
      },
    });

    const response = NextResponse.json({
      ok: true,
      data: video,
      meta: {
        action: result.action,
        previous_claimed_by: result.previous_claimed_by,
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (err) {
    console.error("POST /api/videos/[id]/release error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}

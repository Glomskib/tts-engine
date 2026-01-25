/**
 * POST /api/videos/[id]/renew
 *
 * Atomically renew (extend) an existing video claim.
 *
 * Properties:
 * - Atomic: uses single UPDATE WHERE to prevent race conditions
 * - Idempotent: renewing multiple times just updates expiry
 * - Safe: only claim owner can renew
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atomicRenewClaim } from "@/lib/video-claim";
import { apiError, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getAssignmentTtlMinutes } from "@/lib/settings";
import { checkIncidentReadOnlyBlock } from "@/lib/settings";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { id } = await params;

  // Validate video ID
  if (!id || typeof id !== "string") {
    const err = apiError("BAD_REQUEST", "Video ID is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Video ID must be a valid UUID", 400, { provided: id });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { ttl_minutes } = body as Record<string, unknown>;

  // Get authentication context from session
  const authContext = await getApiAuthContext();

  // Determine actor from authenticated user
  const actor = authContext.user?.id;

  if (!actor) {
    const err = apiError(
      "MISSING_ACTOR",
      "Authentication required. Please sign in to renew claims.",
      401
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Incident mode read-only check (admin bypass)
  const incidentCheck = await checkIncidentReadOnlyBlock(actor, authContext.isAdmin);
  if (incidentCheck.blocked) {
    return NextResponse.json({
      ok: false,
      error: "incident_mode_read_only",
      message: incidentCheck.message || "System is in maintenance mode.",
      correlation_id: correlationId,
    }, { status: 503 });
  }

  // Get effective TTL: request body -> system setting -> default (240)
  let ttl = 240;
  if (typeof ttl_minutes === "number" && ttl_minutes > 0) {
    ttl = ttl_minutes;
  } else {
    try {
      ttl = await getAssignmentTtlMinutes();
    } catch {
      ttl = 240;
    }
  }

  try {
    // Execute atomic renew
    const result = await atomicRenewClaim(supabaseAdmin, {
      video_id: id,
      actor,
      ttl_minutes: ttl,
      correlation_id: correlationId,
    });

    if (!result.ok) {
      // Map result to appropriate HTTP error
      const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
        NOT_FOUND: { code: "NOT_FOUND", status: 404 },
        NOT_CLAIMED: { code: "NOT_CLAIMED", status: 400 },
        NOT_CLAIM_OWNER: { code: "NOT_CLAIM_OWNER", status: 403 },
        RACE_CONDITION: { code: "CONFLICT", status: 409 },
        DB_ERROR: { code: "DB_ERROR", status: 500 },
      };

      const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
      const err = apiError(errorInfo.code, result.message, errorInfo.status);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Fetch full video data for response
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("id,variant_id,account_id,status,google_drive_url,created_at,claimed_by,claimed_at,claim_expires_at,claim_role")
      .eq("id", id)
      .single();

    return NextResponse.json({
      ok: true,
      data: video,
      meta: {
        action: result.action,
        claim_expires_at: result.claim_expires_at,
        ttl_minutes: ttl,
      },
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/videos/[id]/renew error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

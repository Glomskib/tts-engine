/**
 * POST /api/videos/[id]/claim
 *
 * Atomically claim a video using a lease-based model.
 * Claims are time-limited and automatically expire.
 *
 * Properties:
 * - Atomic: uses single UPDATE WHERE to prevent race conditions
 * - Idempotent: same user claiming twice extends their lease
 * - Safe: concurrent claims cannot both succeed
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atomicClaimVideo, type ClaimRole } from "@/lib/video-claim";
import { apiError, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext, type UserRole } from "@/lib/supabase/api-auth";
import { getAssignmentTtlMinutes } from "@/lib/settings";

export const runtime = "nodejs";

const VALID_CLAIM_ROLES: ClaimRole[] = ["recorder", "editor", "uploader", "admin"];

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

  const { claimed_by, claim_role, ttl_minutes } = body as Record<string, unknown>;

  // Get authentication context from session
  const authContext = await getApiAuthContext();

  // Determine actor: prefer authenticated user, fallback to legacy claimed_by for tests
  const isAuthenticated = authContext.user !== null;
  const actor = authContext.user
    ? authContext.user.id
    : (typeof claimed_by === "string" && claimed_by.trim() !== "" ? claimed_by.trim() : null);

  if (!actor) {
    const err = apiError(
      "MISSING_ACTOR",
      "Authentication required. Please sign in to claim videos.",
      401,
      { hint: "Sign in or provide claimed_by in request body for test mode" }
    );
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Determine role: prefer authenticated role, fallback to legacy claim_role for tests
  const actorRole: UserRole | null = isAuthenticated
    ? authContext.role
    : (typeof claim_role === "string" && VALID_CLAIM_ROLES.includes(claim_role as ClaimRole)
      ? (claim_role as UserRole)
      : null);

  // Validate claim_role if provided in body (for non-authenticated requests)
  if (!isAuthenticated && claim_role !== undefined && !VALID_CLAIM_ROLES.includes(claim_role as ClaimRole)) {
    const err = apiError("INVALID_ROLE", `claim_role must be one of: ${VALID_CLAIM_ROLES.join(", ")}`, 400, { provided: claim_role });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Require claim_role
  if (!actorRole) {
    const err = apiError("BAD_REQUEST", "claim_role is required (one of: recorder, editor, uploader, admin)", 400, {
      valid_roles: VALID_CLAIM_ROLES,
    });
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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

  // Determine if actor has admin privileges (admin bypass for WIP limits)
  const isAdmin = actorRole === "admin";

  try {
    // Execute atomic claim
    const result = await atomicClaimVideo(supabaseAdmin, {
      video_id: id,
      actor,
      claim_role: actorRole as ClaimRole,
      ttl_minutes: ttl,
      correlation_id: correlationId,
      is_admin: isAdmin,
    });

    if (!result.ok) {
      // Map result to appropriate HTTP error
      const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
        NOT_FOUND: { code: "NOT_FOUND", status: 404 },
        NOT_CLAIMABLE: { code: "BAD_REQUEST", status: 400 },
        ALREADY_CLAIMED: { code: "ALREADY_CLAIMED", status: 409 },
        WIP_LIMIT_REACHED: { code: "WIP_LIMIT_REACHED", status: 429 },
        DB_ERROR: { code: "DB_ERROR", status: 500 },
      };

      const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
      const err = apiError(errorInfo.code, result.message, errorInfo.status, {
        claimed_by: result.claimed_by,
        claim_expires_at: result.claim_expires_at,
        wip_limit: result.wip_limit,
        wip_current: result.wip_current,
      });
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
    console.error("POST /api/videos/[id]/claim error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

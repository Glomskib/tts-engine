/**
 * POST /api/videos/renew-active
 *
 * Bulk renew all claims for the authenticated user that are expiring soon.
 * This endpoint is idempotent - calling it multiple times is safe.
 *
 * Request body (optional):
 * - ttl_minutes: New TTL for renewed claims (default: LEASE_DURATION_MINUTES)
 * - renew_window_minutes: Renew claims expiring within this window (default: RENEW_WINDOW_MINUTES)
 *
 * Response:
 * - ok: boolean
 * - renewed_count: number of claims renewed
 * - skipped_count: number of claims skipped (not expiring soon)
 * - failed_count: number of renewals that failed
 * - renewed_ids: array of video IDs that were renewed
 * - message: human-readable description
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { bulkRenewClaimsForActor } from "@/lib/video-claim";
import { generateCorrelationId } from "@/lib/api-errors";
import { getLeaseDurationMinutes } from "@/lib/settings";

export async function POST(request: NextRequest) {
  // Extract actor from header
  const actor = request.headers.get("x-actor");
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "Missing x-actor header", code: "MISSING_ACTOR" },
      { status: 401 }
    );
  }

  const correlationId = generateCorrelationId();

  // Parse optional body parameters
  let ttlMinutes: number | undefined;
  let renewWindowMinutes: number | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.ttl_minutes === "number" && body.ttl_minutes > 0) {
      ttlMinutes = body.ttl_minutes;
    }
    if (typeof body.renew_window_minutes === "number" && body.renew_window_minutes > 0) {
      renewWindowMinutes = body.renew_window_minutes;
    }
  } catch {
    // Empty body is fine - use defaults
  }

  // Use system default for TTL if not provided
  if (!ttlMinutes) {
    ttlMinutes = await getLeaseDurationMinutes();
  }

  const result = await bulkRenewClaimsForActor(supabaseAdmin, {
    actor,
    ttl_minutes: ttlMinutes,
    renew_window_minutes: renewWindowMinutes,
    correlation_id: correlationId,
  });

  return NextResponse.json(
    {
      ...result,
      correlation_id: correlationId,
    },
    { status: result.ok ? 200 : 500 }
  );
}

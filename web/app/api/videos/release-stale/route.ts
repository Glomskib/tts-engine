/**
 * POST /api/videos/release-stale
 *
 * Server-side recovery mechanism to expire stale claims.
 * Clears all claims where claim_expires_at has passed.
 *
 * Properties:
 * - Idempotent: running multiple times has no adverse effects
 * - Safe: only clears truly expired claims
 * - Atomic: uses single UPDATE WHERE to prevent race conditions
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expireStaleClaimsAtomic } from "@/lib/video-claim";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

function isAdminAllowed(): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  const adminEnabled = process.env.ADMIN_UI_ENABLED === "true";
  return !isProduction || adminEnabled;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Guard: only allowed if admin is enabled or user is admin
  const authContext = await getApiAuthContext(request);
  const isAdmin = authContext.isAdmin;

  if (!isAdmin && !isAdminAllowed()) {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const actor = authContext.user?.id || "system";

  try {
    // Execute atomic expire operation
    const result = await expireStaleClaimsAtomic(supabaseAdmin, {
      actor,
      correlation_id: correlationId,
    });

    return NextResponse.json({
      ok: result.ok,
      expired_count: result.expired_count,
      expired_ids: result.expired_ids,
      message: result.message,
      correlation_id: correlationId,
    });

  } catch (err) {
    console.error("POST /api/videos/release-stale error:", err);
    const error = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...error.body, correlation_id: correlationId }, { status: error.status });
  }
}

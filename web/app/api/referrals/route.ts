/**
 * Referral API
 * GET  — Get referral stats + recent referrals for the authenticated user
 * POST — Record a referral click (no auth required — called from landing page)
 */

import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import {
  getReferralStats,
  getRecentReferrals,
  recordReferralClick,
} from "@/lib/referrals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const [stats, recent] = await Promise.all([
      getReferralStats(authContext.user.id),
      getRecentReferrals(authContext.user.id),
    ]);

    const res = NextResponse.json({
      ok: true,
      data: { stats, recent },
      correlation_id: correlationId,
    });
    res.headers.set("x-correlation-id", correlationId);
    return res;
  } catch (err) {
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Unknown error",
      500,
      correlationId,
    );
  }
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  const body = await request.json().catch(() => ({}));
  const code = body.referral_code || body.code;

  if (!code || typeof code !== "string") {
    return createApiErrorResponse("BAD_REQUEST", "referral_code is required", 400, correlationId);
  }

  try {
    await recordReferralClick(code.toUpperCase().trim());
    const res = NextResponse.json({ ok: true, correlation_id: correlationId });
    res.headers.set("x-correlation-id", correlationId);
    return res;
  } catch {
    // Silently succeed — don't expose referral tracking errors
    return NextResponse.json({ ok: true, correlation_id: correlationId });
  }
}

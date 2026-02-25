import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import {
  MP_PLAN_CONFIGS,
  mpTierFromStripePriceId,
  type MpPlanTier,
} from "@/lib/marketplace/plan-config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/marketplace/stripe-mapping
 *
 * Admin-only health check for Stripe ↔ tier mapping.
 * Returns per-tier status (OK / MISSING / MISMATCH) without
 * exposing full price IDs.
 */
export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId,
    );
  }

  const ENV_KEYS: Record<MpPlanTier, string> = {
    pool_15: "STRIPE_PRICE_MP_POOL",
    dedicated_30: "STRIPE_PRICE_MP_DEDICATED",
    scale_50: "STRIPE_PRICE_MP_SCALE",
    custom: "",
  };

  const tiers = (
    Object.entries(MP_PLAN_CONFIGS) as [MpPlanTier, (typeof MP_PLAN_CONFIGS)[MpPlanTier]][]
  ).map(([tier, cfg]) => {
    if (tier === "custom") {
      return { tier, label: cfg.label, status: "SKIP" as const };
    }

    const hasId = !!cfg.stripe_price_id;
    const reverseTier = hasId
      ? mpTierFromStripePriceId(cfg.stripe_price_id!)
      : undefined;
    const reverseOk = hasId && reverseTier === tier;

    const status: "OK" | "MISSING" | "MISMATCH" = !hasId
      ? "MISSING"
      : reverseOk
        ? "OK"
        : "MISMATCH";

    return {
      tier,
      label: cfg.label,
      env_key: ENV_KEYS[tier],
      status,
      id_prefix: hasId ? cfg.stripe_price_id!.slice(0, 10) + "..." : null,
      daily_cap: cfg.daily_cap,
      sla_hours: cfg.sla_hours,
      priority_weight: cfg.priority_weight,
      price_usd: cfg.price_usd,
    };
  });

  const allOk = tiers.every((t) => t.status === "OK" || t.status === "SKIP");

  return NextResponse.json({ ok: allOk, tiers });
}

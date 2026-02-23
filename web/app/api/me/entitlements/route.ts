import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { getEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await getEntitlement(authContext.user.id);

  if (!entitlement) {
    // No row yet — treat as free / active
    return NextResponse.json({
      plan: "free",
      active: true,
      current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
  }

  return NextResponse.json({
    plan: entitlement.plan,
    active: entitlement.status === "active",
    current_period_end: entitlement.current_period_end,
    stripe_customer_id: entitlement.stripe_customer_id,
    stripe_subscription_id: entitlement.stripe_subscription_id,
  });
}

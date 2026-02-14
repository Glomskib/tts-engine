import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

const PLAN_CREDITS: Record<string, number> = {
  free: 5,
  creator_lite: 75,
  creator_pro: 300,
  brand: 1000,
  agency: 9999,
};

export async function POST(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only allow test-* emails
  const email = authContext.user.email || "";
  if (!email.startsWith("test-")) {
    return NextResponse.json({ error: "Only available for test accounts" }, { status: 403 });
  }

  const { planId } = await request.json();
  if (!planId || !PLAN_CREDITS[planId]) {
    return NextResponse.json(
      { error: "Invalid planId", valid: Object.keys(PLAN_CREDITS) },
      { status: 400 }
    );
  }

  const userId = authContext.user.id;
  const credits = PLAN_CREDITS[planId];

  // Update subscription
  const { error: subErr } = await supabaseAdmin
    .from("user_subscriptions")
    .update({ plan_id: planId, status: "active" })
    .eq("user_id", userId);

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  // Update credits
  const { error: credErr } = await supabaseAdmin
    .from("user_credits")
    .update({ credits_remaining: credits, credits_used_this_period: 0 })
    .eq("user_id", userId);

  if (credErr) {
    return NextResponse.json({ error: credErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, planId, credits });
}

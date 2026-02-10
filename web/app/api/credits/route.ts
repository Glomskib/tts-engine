import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

// GET: Fetch user's credit balance and subscription info
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    // Admin bypass: Return unlimited credits for admin users
    if (authContext.isAdmin) {
      return NextResponse.json({
        ok: true,
        credits: {
          remaining: -1, // -1 indicates unlimited
          usedThisPeriod: 0,
          lifetimeUsed: 0,
          freeCreditsTotal: 0,
          freeCreditsUsed: 0,
          periodStart: null,
          periodEnd: null,
          isUnlimited: true,
        },
        subscription: {
          planId: "admin",
          planName: "Admin",
          status: "active",
          creditsPerMonth: -1,
          billingPeriod: null,
          currentPeriodEnd: null,
          isUnlimited: true,
        },
        isAdmin: true,
        correlation_id: correlationId,
      });
    }

    // Get credits
    const { data: credits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("*")
      .eq("user_id", authContext.user.id)
      .single();

    if (creditsError && creditsError.code !== "PGRST116") {
      console.error(`[${correlationId}] Failed to fetch credits:`, creditsError);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch credits", 500, correlationId);
    }

    // Get subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("user_subscriptions")
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq("user_id", authContext.user.id)
      .single();

    if (subError && subError.code !== "PGRST116") {
      console.error(`[${correlationId}] Failed to fetch subscription:`, subError);
    }

    // Default values for new users
    const defaultCredits = {
      remaining: 5,
      usedThisPeriod: 0,
      lifetimeUsed: 0,
      freeCreditsTotal: 5,
      freeCreditsUsed: 0,
      periodStart: null,
      periodEnd: null,
    };

    const defaultSubscription = {
      planId: "free",
      planName: "Free",
      status: "active",
      creditsPerMonth: 0,
      billingPeriod: null,
      currentPeriodEnd: null,
      periodEnd: null,
      stripeCustomerId: null,
    };

    // Format response
    const creditsResponse = credits
      ? {
          remaining: credits.credits_remaining ?? 5,
          usedThisPeriod: credits.credits_used_this_period ?? 0,
          lifetimeUsed: credits.lifetime_credits_used ?? 0,
          freeCreditsTotal: credits.free_credits_total ?? 5,
          freeCreditsUsed: credits.free_credits_used ?? 0,
          periodStart: credits.period_start,
          periodEnd: credits.period_end,
        }
      : defaultCredits;

    const subscriptionResponse = subscription?.plan
      ? {
          planId: subscription.plan.id,
          planName: subscription.plan.name,
          status: subscription.status,
          creditsPerMonth: subscription.plan.credits_per_month,
          billingPeriod: subscription.billing_period,
          currentPeriodEnd: subscription.current_period_end,
          periodEnd: subscription.current_period_end,
          stripeCustomerId: subscription.stripe_customer_id || null,
        }
      : defaultSubscription;

    return NextResponse.json({
      ok: true,
      credits: creditsResponse,
      subscription: subscriptionResponse,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Credits error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch credits", 500, correlationId);
  }
}

// POST: Deduct a credit
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: { description?: string; skitId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is ok
  }

  const { description = "Credit usage", skitId } = body;

  try {
    // Call the deduct_credit RPC function
    const { data: result, error } = await supabaseAdmin.rpc("deduct_credit", {
      p_user_id: authContext.user.id,
      p_description: description,
    });

    if (error) {
      console.error(`[${correlationId}] Failed to deduct credit:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to deduct credit", 500, correlationId);
    }

    const deductResult = result?.[0];

    if (!deductResult?.success) {
      return NextResponse.json({
        ok: false,
        error: "No credits remaining",
        creditsRemaining: deductResult?.credits_remaining ?? 0,
        correlation_id: correlationId,
      }, { status: 402 });
    }

    // If skitId provided, log the transaction reference
    if (skitId) {
      await supabaseAdmin
        .from("credit_transactions")
        .update({ reference_id: skitId })
        .eq("user_id", authContext.user.id)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    return NextResponse.json({
      ok: true,
      success: true,
      creditsRemaining: deductResult.credits_remaining,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Deduct credit error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to deduct credit", 500, correlationId);
  }
}

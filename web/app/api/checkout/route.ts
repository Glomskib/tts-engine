import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import Stripe from "stripe";
import { z } from "zod";

export const runtime = "nodejs";

// Lazy initialization to avoid build-time errors
let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe!;
}

const CheckoutSchema = z.object({
  planId: z.enum(["starter", "pro", "team"]),
  billingPeriod: z.enum(["monthly", "yearly"]).default("monthly"),
});

// Price ID mapping - set these in your environment
const PRICE_IDS: Record<string, Record<string, string>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || "",
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || "",
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || "",
  },
  team: {
    monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || "",
    yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || "",
  },
};

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  if (!process.env.STRIPE_SECRET_KEY) {
    return createApiErrorResponse("CONFIG_ERROR", "Stripe not configured", 500, correlationId);
  }

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parseResult = CheckoutSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const { planId, billingPeriod } = parseResult.data;

  try {
    // Get the price ID
    const priceId = PRICE_IDS[planId]?.[billingPeriod];
    if (!priceId) {
      return createApiErrorResponse("CONFIG_ERROR", `Price not configured for ${planId} ${billingPeriod}`, 500, correlationId);
    }

    // Get or create Stripe customer
    let stripeCustomerId: string;

    // Check if user already has a Stripe customer ID
    const { data: subscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", authContext.user.id)
      .single();

    if (subscription?.stripe_customer_id) {
      stripeCustomerId = subscription.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await getStripe().customers.create({
        email: authContext.user.email,
        metadata: {
          user_id: authContext.user.id,
        },
      });
      stripeCustomerId = customer.id;
    }

    // Determine URLs
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const successUrl = `${origin}/admin?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/pricing?checkout=cancelled`;

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: authContext.user.id,
        plan_id: planId,
        billing_period: billingPeriod,
      },
      subscription_data: {
        metadata: {
          user_id: authContext.user.id,
          plan_id: planId,
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      url: session.url,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Checkout error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to create checkout session", 500, correlationId);
  }
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import Stripe from "stripe";

export const runtime = "nodejs";

// Lazy initialization
let stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

// POST: Create Stripe checkout session for credit purchase
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const stripeClient = getStripe();
  if (!stripeClient) {
    console.error(`[${correlationId}] Stripe not configured`);
    return createApiErrorResponse("CONFIG_ERROR", "Payment system not configured", 500, correlationId);
  }

  try {
    const body = await request.json();
    const { package_id } = body;

    if (!package_id) {
      return createApiErrorResponse("VALIDATION_ERROR", "Package ID required", 400, correlationId);
    }

    // Fetch package details
    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from("credit_packages")
      .select("*")
      .eq("id", package_id)
      .eq("is_active", true)
      .single();

    if (pkgError || !pkg) {
      return createApiErrorResponse("NOT_FOUND", "Package not found", 404, correlationId);
    }

    // Get or create Stripe customer
    let stripeCustomerId: string;

    const { data: subscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", authContext.user.id)
      .single();

    if (subscription?.stripe_customer_id) {
      stripeCustomerId = subscription.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripeClient.customers.create({
        email: authContext.user.email || undefined,
        metadata: {
          user_id: authContext.user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID
      await supabaseAdmin.from("user_subscriptions").upsert(
        {
          user_id: authContext.user.id,
          stripe_customer_id: stripeCustomerId,
          plan_id: "free",
          status: "active",
        },
        { onConflict: "user_id" }
      );
    }

    // Determine base URL
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create checkout session
    const session = await stripeClient.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${pkg.name} - ${pkg.credits} Credits`,
              description: pkg.description,
            },
            unit_amount: pkg.price_cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: authContext.user.id,
        package_id: pkg.id,
        credits: pkg.credits.toString(),
        type: "credit_purchase",
      },
      success_url: `${origin}/admin/credits?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/credits?canceled=true`,
    });

    // Create pending purchase record
    await supabaseAdmin.from("credit_purchases").insert({
      user_id: authContext.user.id,
      package_id: pkg.id,
      credits_purchased: pkg.credits,
      amount_paid_cents: pkg.price_cents,
      stripe_checkout_session_id: session.id,
      status: "pending",
    });

    console.log(`[${correlationId}] Created checkout session ${session.id} for user ${authContext.user.id}`);

    return NextResponse.json({
      ok: true,
      url: session.url,
      session_id: session.id,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Purchase error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to create checkout",
      500,
      correlationId
    );
  }
}

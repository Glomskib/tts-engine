import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

// Lazy initialization to avoid build-time errors
let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe!;
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Plan credit allocations
const PLAN_CREDITS: Record<string, number> = {
  starter: 100,
  pro: 500,
  team: 2000,
  free: 0,
};

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error(`[${correlationId}] Missing stripe signature`);
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!webhookSecret) {
    console.error(`[${correlationId}] Webhook secret not configured`);
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(`[${correlationId}] Webhook signature verification failed:`, err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[${correlationId}] Stripe webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(correlationId, session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(correlationId, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancelled(correlationId, subscription);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(correlationId, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(correlationId, invoice);
        break;
      }

      default:
        console.log(`[${correlationId}] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[${correlationId}] Error handling webhook:`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(correlationId: string, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id;

  if (!userId || !planId) {
    console.error(`[${correlationId}] Missing metadata in checkout session`);
    return;
  }

  console.log(`[${correlationId}] Checkout completed for user ${userId}, plan ${planId}`);

  // Update or create subscription record
  const { error } = await supabaseAdmin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      status: "active",
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      billing_period: session.metadata?.billing_period || "monthly",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    console.error(`[${correlationId}] Failed to update subscription:`, error);
  }
}

async function handleSubscriptionChange(correlationId: string, subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    // Try to find user by customer ID
    const { data: existingSub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single();

    if (!existingSub) {
      console.error(`[${correlationId}] Cannot find user for subscription ${subscription.id}`);
      return;
    }
  }

  const planId = subscription.metadata?.plan_id || "starter";
  const status = subscription.status === "active" ? "active" : subscription.status;

  console.log(`[${correlationId}] Subscription ${subscription.status} for plan ${planId}`);

  // Get period from subscription items if available
  const periodStart = (subscription as { current_period_start?: number }).current_period_start;
  const periodEnd = (subscription as { current_period_end?: number }).current_period_end;

  const updateData: Record<string, unknown> = {
    plan_id: planId,
    status: status,
    stripe_subscription_id: subscription.id,
    updated_at: new Date().toISOString(),
  };

  if (periodStart) {
    updateData.current_period_start = new Date(periodStart * 1000).toISOString();
  }
  if (periodEnd) {
    updateData.current_period_end = new Date(periodEnd * 1000).toISOString();
  }

  const { error } = await supabaseAdmin
    .from("user_subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error(`[${correlationId}] Failed to update subscription:`, error);
  }
}

async function handleSubscriptionCancelled(correlationId: string, subscription: Stripe.Subscription) {
  console.log(`[${correlationId}] Subscription cancelled: ${subscription.id}`);

  // Downgrade to free plan
  const { error } = await supabaseAdmin
    .from("user_subscriptions")
    .update({
      plan_id: "free",
      status: "cancelled",
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error(`[${correlationId}] Failed to cancel subscription:`, error);
  }
}

async function handleInvoicePaid(correlationId: string, invoice: Stripe.Invoice) {
  // Get subscription ID from invoice - cast to access subscription property
  const invoiceData = invoice as unknown as { subscription?: string | { id: string } | null };
  const subscriptionId = typeof invoiceData.subscription === 'string'
    ? invoiceData.subscription
    : invoiceData.subscription?.id;

  if (!subscriptionId) return;

  // Get subscription to find user
  const { data: subscription } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscription) {
    console.error(`[${correlationId}] Cannot find subscription for invoice`);
    return;
  }

  const creditsToAdd = PLAN_CREDITS[subscription.plan_id] || 0;

  console.log(`[${correlationId}] Invoice paid, adding ${creditsToAdd} credits for user ${subscription.user_id}`);

  // Reset credits for the new billing period
  const { error } = await supabaseAdmin.from("user_credits").upsert(
    {
      user_id: subscription.user_id,
      credits_remaining: creditsToAdd,
      credits_used_this_period: 0,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    console.error(`[${correlationId}] Failed to reset credits:`, error);
  }

  // Log transaction
  await supabaseAdmin.from("credit_transactions").insert({
    user_id: subscription.user_id,
    amount: creditsToAdd,
    type: "credit",
    description: `Monthly credits - ${subscription.plan_id} plan`,
  });
}

async function handlePaymentFailed(correlationId: string, invoice: Stripe.Invoice) {
  // Get subscription ID from invoice - cast to access subscription property
  const invoiceData = invoice as unknown as { subscription?: string | { id: string } | null };
  const subscriptionId = typeof invoiceData.subscription === 'string'
    ? invoiceData.subscription
    : invoiceData.subscription?.id;

  if (!subscriptionId) return;

  console.log(`[${correlationId}] Payment failed for subscription ${subscriptionId}`);

  // Update subscription status
  const { error } = await supabaseAdmin
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error(`[${correlationId}] Failed to update subscription status:`, error);
  }
}

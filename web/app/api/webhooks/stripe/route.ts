import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { recordReferralConversion } from "@/lib/referrals";
import { queueEmailSequence } from "@/lib/email/scheduler";
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

import {
  PLAN_DETAILS,
  CREDIT_ALLOCATIONS,
  VIDEO_QUOTAS,
  type PlanName,
  type SubscriptionType
} from "@/lib/subscriptions";

// Legacy aliases for backwards compatibility
const PLAN_CREDITS = CREDIT_ALLOCATIONS;
const PLAN_VIDEOS = VIDEO_QUOTAS;

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

  console.info(`[${correlationId}] Stripe webhook event: ${event.type}`);

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
        console.info(`[${correlationId}] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[${correlationId}] Error handling webhook:`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(correlationId: string, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const sessionType = session.metadata?.type;

  if (!userId) {
    console.error(`[${correlationId}] Missing user_id in checkout session`);
    return;
  }

  // Handle credit pack purchases
  if (sessionType === "credit_purchase") {
    const packageId = session.metadata?.package_id;
    const credits = parseInt(session.metadata?.credits || "0");

    console.info(`[${correlationId}] Credit purchase completed for user ${userId}: ${credits} credits`);

    // Add credits to user
    const { error: creditError } = await supabaseAdmin.rpc("add_purchased_credits", {
      p_user_id: userId,
      p_amount: credits,
      p_description: `Credit pack purchase: ${packageId}`,
    });

    if (creditError) {
      console.error(`[${correlationId}] Failed to add credits:`, creditError);
    }

    // Update purchase record
    await supabaseAdmin
      .from("credit_purchases")
      .update({
        status: "completed",
        stripe_payment_intent_id: session.payment_intent as string,
        completed_at: new Date().toISOString(),
      })
      .eq("stripe_checkout_session_id", session.id);

    return;
  }

  // Handle subscription checkout
  const planId = session.metadata?.plan_id as PlanName | undefined;
  const subscriptionType = (session.metadata?.subscription_type || 'saas') as SubscriptionType;

  if (!planId) {
    console.error(`[${correlationId}] Missing plan_id in checkout session`);
    return;
  }

  console.info(`[${correlationId}] Checkout completed for user ${userId}, plan ${planId}, type ${subscriptionType}`);

  // Get plan details
  const plan = PLAN_DETAILS[planId];
  const isVideoClient = subscriptionType === 'video_editing';
  const videosPerMonth = isVideoClient ? (plan?.videos || PLAN_VIDEOS[planId] || 0) : 0;
  const credits = plan?.credits || PLAN_CREDITS[planId] || 0;

  // Update or create subscription record
  const { error } = await supabaseAdmin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      subscription_type: subscriptionType,
      status: "active",
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      videos_per_month: videosPerMonth,
      videos_remaining: videosPerMonth,
      videos_used_this_month: 0,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    console.error(`[${correlationId}] Failed to update subscription:`, error);
  }

  // Initialize credits for the user
  const { error: creditError } = await supabaseAdmin.from("user_credits").upsert(
    {
      user_id: userId,
      credits_remaining: credits,
      credits_used_this_period: 0,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (creditError) {
    console.error(`[${correlationId}] Failed to initialize credits:`, creditError);
  }

  // Process referral conversion — credit the referrer if this user was referred
  try {
    const { data: userSub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("referred_by")
      .eq("user_id", userId)
      .single();

    if (userSub?.referred_by) {
      await recordReferralConversion(userId);
      console.info(`[${correlationId}] Referral conversion recorded for user ${userId}`);
    }
  } catch (refErr) {
    console.error(`[${correlationId}] Referral conversion error (non-fatal):`, refErr);
  }
}

async function handleSubscriptionChange(correlationId: string, subscription: Stripe.Subscription) {
  let userId = subscription.metadata?.user_id;

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
    userId = existingSub.user_id;
  }

  const planId = (subscription.metadata?.plan_id || "starter") as PlanName;
  const subscriptionType = (subscription.metadata?.subscription_type || 'saas') as SubscriptionType;
  const status = subscription.status === "active" ? "active" : subscription.status;

  console.info(`[${correlationId}] Subscription ${subscription.status} for plan ${planId}, type ${subscriptionType}`);

  // Get plan details
  const plan = PLAN_DETAILS[planId];
  const isVideoClient = subscriptionType === 'video_editing';
  const videosPerMonth = isVideoClient ? (plan?.videos || PLAN_VIDEOS[planId] || 0) : 0;

  // Get period from subscription items if available
  const periodStart = (subscription as { current_period_start?: number }).current_period_start;
  const periodEnd = (subscription as { current_period_end?: number }).current_period_end;

  const updateData: Record<string, unknown> = {
    plan_id: planId,
    subscription_type: subscriptionType,
    status: status,
    stripe_subscription_id: subscription.id,
    videos_per_month: videosPerMonth,
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
  console.info(`[${correlationId}] Subscription cancelled: ${subscription.id}`);

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

  // Queue winback email sequence for churned users (non-fatal)
  try {
    const { data: userSub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single();

    if (userSub) {
      // Look up user email from Supabase auth
      const stripe = getStripe();
      const customer = await stripe.customers.retrieve(subscription.customer as string);
      const email = (customer as Stripe.Customer).email;

      if (email) {
        await queueEmailSequence(email, email.split("@")[0], "winback", {
          discountCode: "COMEBACK50",
        });
        console.info(`[${correlationId}] Winback sequence queued for ${email}`);
      }
    }
  } catch (winbackErr) {
    console.error(`[${correlationId}] Winback email queue error (non-fatal):`, winbackErr);
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
    .select("user_id, plan_id, subscription_type, videos_per_month")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscription) {
    console.error(`[${correlationId}] Cannot find subscription for invoice`);
    return;
  }

  const planId = subscription.plan_id as PlanName;
  const plan = PLAN_DETAILS[planId];
  const creditsToAdd = plan?.credits || PLAN_CREDITS[planId] || 0;
  const isVideoClient = subscription.subscription_type === 'video_editing';

  console.info(`[${correlationId}] Invoice paid for user ${subscription.user_id}, plan ${planId}, credits ${creditsToAdd}`);

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

  // Reset video quota for video editing clients
  if (isVideoClient) {
    const videosPerMonth = subscription.videos_per_month || PLAN_VIDEOS[planId] || 0;

    console.info(`[${correlationId}] Resetting video quota to ${videosPerMonth} for user ${subscription.user_id}`);

    const { error: videoError } = await supabaseAdmin
      .from("user_subscriptions")
      .update({
        videos_remaining: videosPerMonth,
        videos_used_this_month: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", subscription.user_id);

    if (videoError) {
      console.error(`[${correlationId}] Failed to reset video quota:`, videoError);
    }
  }

  // Log transaction
  await supabaseAdmin.from("credit_transactions").insert({
    user_id: subscription.user_id,
    amount: creditsToAdd,
    type: "credit",
    description: `Monthly credits - ${planId} plan`,
  });
}

async function handlePaymentFailed(correlationId: string, invoice: Stripe.Invoice) {
  // Get subscription ID from invoice - cast to access subscription property
  const invoiceData = invoice as unknown as { subscription?: string | { id: string } | null };
  const subscriptionId = typeof invoiceData.subscription === 'string'
    ? invoiceData.subscription
    : invoiceData.subscription?.id;

  if (!subscriptionId) return;

  console.info(`[${correlationId}] Payment failed for subscription ${subscriptionId}`);

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

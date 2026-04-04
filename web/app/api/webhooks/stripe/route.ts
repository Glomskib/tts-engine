import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId } from "@/lib/api-errors";
import { recordReferralConversion } from "@/lib/referrals";
import { recordCommission } from "@/lib/affiliates";
import { updateAttributionOnPlanChange } from "@/lib/affiliate-tracking";
import { queueEmailSequence } from "@/lib/email/scheduler";
import { sendTelegramNotification } from "@/lib/telegram";
import { syncRoleFromPlan } from "@/lib/sync-role";
import { syncDiscordRolesIfLinked } from "@/lib/discord/roles";
import { upsertEntitlement, PLAN_ID_TO_ENTITLEMENT } from "@/lib/entitlements";
import {
  isEventProcessed,
  markEventProcessed,
  syncMpPlanFromStripe,
  cancelMpPlan,
  extractMpClientId,
  extractPriceId,
} from "@/lib/marketplace/plan-sync";
import { isMpStripePriceId } from "@/lib/marketplace/plan-config";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Strip Stripe secrets from error messages to prevent leaking
 * sk_live_*, sk_test_*, whsec_* values in logs.
 */
export function sanitizeWebhookError(err: unknown): { message: string; type?: string } {
  const secretPattern = /\b(sk_live_|sk_test_|whsec_)\S+/g;
  let message = "Unknown error";
  let type: string | undefined;

  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  }

  message = message.replace(secretPattern, "[REDACTED]");

  // Stripe errors have a `type` property
  if (err && typeof err === "object" && "type" in err) {
    type = String((err as { type: unknown }).type);
  }

  return type ? { message, type } : { message };
}

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
  migrateOldPlanId,
  type PlanName,
  type SubscriptionType
} from "@/lib/subscriptions";
import { FLASHFLOW_PLANS, isFlashFlowPlan } from "@/lib/plans";
import { resetRenderCount } from "@/lib/render-entitlement";

// Legacy aliases for backwards compatibility
const PLAN_CREDITS = CREDIT_ALLOCATIONS;
const PLAN_VIDEOS = VIDEO_QUOTAS;

// FlashFlow render limits keyed by plan ID
const FF_PLAN_RENDERS: Record<string, number> = Object.fromEntries(
  Object.values(FLASHFLOW_PLANS).map(p => [p.id, p.rendersPerMonth])
);

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
    console.error(`[${correlationId}] Webhook signature verification failed:`, sanitizeWebhookError(err));
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.info(`[${correlationId}] Stripe webhook event: ${event.type} (${event.id})`);

  // Idempotency guard — skip already-processed events
  if (await isEventProcessed(event.id)) {
    console.info(`[${correlationId}] Skipping duplicate event ${event.id}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

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

      case "account.updated": {
        // Stripe Connect onboarding completion
        const account = event.data.object as Stripe.Account;
        await handleAccountUpdated(correlationId, account);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(correlationId, charge);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeCreated(correlationId, dispute);
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        console.info(`[${correlationId}] Trial ending soon for subscription ${subscription.id}`);
        break;
      }

      case "customer.deleted": {
        const customer = event.data.object as Stripe.Customer;
        console.info(`[${correlationId}] Stripe customer deleted: ${customer.id}`);
        break;
      }

      default:
        console.info(`[${correlationId}] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed for idempotency
    await markEventProcessed(event.id, event.type);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[${correlationId}] Error handling webhook:`, sanitizeWebhookError(error));
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(correlationId: string, session: Stripe.Checkout.Session) {
  // ── Marketplace checkout ───────────────────────────────
  // If this session has mp_client_id metadata, it's a marketplace subscription.
  // The actual plan sync happens in subscription.created/updated, so we just log here.
  const mpClientId = session.metadata?.mp_client_id;
  if (mpClientId) {
    console.info(`[${correlationId}] Marketplace checkout completed for client ${mpClientId}`);
    sendTelegramNotification(
      `💰 MP signup: client <b>${mpClientId}</b> checkout completed`
    ).catch(() => {});
    return;
  }

  // ── SaaS / credit checkout (existing) ──────────────────
  const userId = session.metadata?.user_id;
  const sessionType = session.metadata?.type;

  if (!userId) {
    console.error(`[${correlationId}] Missing user_id in checkout session`);
    return;
  }

  // Handle credit pack purchases (both legacy credit_packages and new addon flow)
  if (sessionType === "credit_purchase") {
    const packageId = session.metadata?.package_id;
    const addonId = session.metadata?.addon_id;
    const credits = parseInt(session.metadata?.credit_amount || session.metadata?.credits || "0");

    console.info(`[${correlationId}] Credit purchase completed for user ${userId}: ${credits} credits`);

    // Add credits to user
    const { error: creditError } = await supabaseAdmin.rpc("add_purchased_credits", {
      p_user_id: userId,
      p_amount: credits,
      p_description: `Credit purchase: ${addonId || packageId || 'addon'}`,
    });

    if (creditError) {
      console.error(`[${correlationId}] Failed to add credits:`, creditError);
    }

    // Update purchase record (legacy flow)
    if (packageId) {
      await supabaseAdmin
        .from("credit_purchases")
        .update({
          status: "completed",
          stripe_payment_intent_id: session.payment_intent as string,
          completed_at: new Date().toISOString(),
        })
        .eq("stripe_checkout_session_id", session.id);
    }

    // Telegram notification
    const purchaseEmail = session.customer_details?.email || 'unknown';
    const amount = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : 'N/A';
    sendTelegramNotification(
      `💳 Credit purchase: <b>${purchaseEmail}</b> bought ${credits} credits (${amount})`
    ).catch(() => {});

    return;
  }

  // Handle subscription checkout — normalize old plan IDs
  const rawPlanId = session.metadata?.plan_id;
  const planId = rawPlanId ? migrateOldPlanId(rawPlanId) as PlanName : undefined;
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

  // FlashFlow render plan: set render quota columns
  const ffRendersPerMonth = isFlashFlowPlan(planId) ? (FF_PLAN_RENDERS[planId] ?? null) : undefined;

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
      // FlashFlow render quota — only set for FF plans
      ...(ffRendersPerMonth !== undefined && {
        ff_renders_per_month: ffRendersPerMonth,
        ff_renders_used_this_month: 0,
      }),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    console.error(`[${correlationId}] Failed to update subscription:`, error);
    // Critical failure — user paid but subscription not recorded. Alert immediately.
    sendTelegramNotification(
      `🚨 CRITICAL: Subscription upsert failed for user <b>${userId}</b> plan <b>${planId}</b>. CorrelationId: ${correlationId}. Manual intervention required.`
    ).catch(() => {});
  }

  // Sync role to match new plan
  await syncRoleFromPlan(userId, planId);
  await syncDiscordRolesIfLinked(userId);

  // Upsert entitlement (non-fatal)
  const entitlementPlan = PLAN_ID_TO_ENTITLEMENT[planId] || "free";
  await upsertEntitlement(userId, {
    plan: entitlementPlan,
    status: "active",
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: session.subscription as string,
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, correlationId);

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
    // Critical failure — user paid but credits not provisioned. Alert immediately.
    sendTelegramNotification(
      `🚨 CRITICAL: Credit provisioning failed for user <b>${userId}</b> (${credits} credits on ${planId}). CorrelationId: ${correlationId}. Manual fix required.`
    ).catch(() => {});
  }

  // Telegram notification
  const planName = plan?.name || planId;
  const amount = session.amount_total ? `$${(session.amount_total / 100).toFixed(0)}` : 'N/A';
  const customerEmail = session.customer_details?.email || 'unknown';
  sendTelegramNotification(
    `💰 New subscriber! <b>${customerEmail}</b> → ${planName} (${amount}/mo) | ${credits} credits provisioned`
  ).catch(() => {});

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
  // ── Marketplace plan sync ──────────────────────────────
  const mpClientId = extractMpClientId(subscription.metadata as Record<string, string>);
  const mpPriceId = extractPriceId(subscription.items);

  // Guard: if this is a marketplace sub but the price doesn't map to a tier,
  // log a warning and bail — don't fall through to the SaaS path.
  if (mpClientId && (!mpPriceId || !isMpStripePriceId(mpPriceId))) {
    console.warn(`[${correlationId}] MP sub with unknown price: client=${mpClientId} price=${mpPriceId}`);
    return;
  }

  if (mpClientId && mpPriceId && isMpStripePriceId(mpPriceId)) {
    await syncMpPlanFromStripe(correlationId, {
      subscriptionId: subscription.id,
      priceId: mpPriceId,
      status: subscription.status,
      currentPeriodEnd: (subscription as unknown as { current_period_end?: number }).current_period_end ?? null,
      clientId: mpClientId,
    });
    return; // marketplace subs don't touch user_subscriptions
  }

  // ── SaaS subscription handling (existing) ──────────────
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

  const planId = migrateOldPlanId(subscription.metadata?.plan_id || "free") as PlanName;
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

  // Upsert entitlement (non-fatal)
  const entitlementPlan = PLAN_ID_TO_ENTITLEMENT[planId] || "free";
  const entitlementStatus = status === "active" ? "active" : status === "past_due" ? "past_due" : "active";
  await upsertEntitlement(userId, {
    plan: entitlementPlan,
    status: entitlementStatus,
    stripe_subscription_id: subscription.id,
    ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString() } : {}),
  }, correlationId);

  // Sync role to match updated plan
  await syncRoleFromPlan(userId, planId);
  await syncDiscordRolesIfLinked(userId);
}

async function handleSubscriptionCancelled(correlationId: string, subscription: Stripe.Subscription) {
  console.info(`[${correlationId}] Subscription cancelled: ${subscription.id}`);

  // ── Marketplace plan cancellation ──────────────────────
  const mpClientId = extractMpClientId(subscription.metadata as Record<string, string>);
  if (mpClientId) {
    await cancelMpPlan(correlationId, subscription.id);
    return; // marketplace subs don't touch user_subscriptions
  }

  // ── SaaS cancellation (existing) ───────────────────────
  // Downgrade to free plan
  const { data: cancelledSub, error } = await supabaseAdmin
    .from("user_subscriptions")
    .update({
      plan_id: "free",
      subscription_type: "saas",
      status: "cancelled",
      stripe_subscription_id: null,
      videos_per_month: 0,
      videos_remaining: 0,
      videos_used_this_month: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id")
    .single();

  if (error) {
    console.error(`[${correlationId}] Failed to cancel subscription:`, error);
  }

  // Sync role to free on cancellation
  if (cancelledSub?.user_id) {
    await syncRoleFromPlan(cancelledSub.user_id, 'free');
    await syncDiscordRolesIfLinked(cancelledSub.user_id);

    // Upsert entitlement — downgrade to free (non-fatal)
    await upsertEntitlement(cancelledSub.user_id, {
      plan: "free",
      status: "canceled",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
    }, correlationId);
  }

  // H8: Reset credits to free tier amount (5 credits)
  if (cancelledSub?.user_id) {
    const { error: creditError } = await supabaseAdmin
      .from("user_credits")
      .update({
        credits_remaining: 5,
        credits_used_this_period: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", cancelledSub.user_id);

    if (creditError) {
      console.error(`[${correlationId}] Failed to reset credits on cancellation:`, creditError);
    } else {
      console.info(`[${correlationId}] Credits reset to free tier for user ${cancelledSub.user_id}`);
    }
  }

  // Telegram notification
  sendTelegramNotification(
    `📉 Canceled: subscription ${subscription.id}${cancelledSub?.user_id ? ` (user ${cancelledSub.user_id.slice(0, 8)})` : ''} — downgraded to free`
  ).catch(() => {});

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
    // Renewal credit reset failed — user billed but credits not refreshed.
    sendTelegramNotification(
      `🚨 CRITICAL: Credit renewal failed for user <b>${subscription.user_id}</b> plan <b>${planId}</b>. CorrelationId: ${correlationId}. Manual fix required.`
    ).catch(() => {});
  }

  // Upsert entitlement — confirm active on renewal (non-fatal)
  await upsertEntitlement(subscription.user_id, {
    status: "active",
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, correlationId);

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

  // Reset FlashFlow render count at start of new billing period
  if (isFlashFlowPlan(planId)) {
    console.info(`[${correlationId}] Resetting FF render count for user ${subscription.user_id}`);
    await resetRenderCount(subscription.user_id);
  }

  // Log transaction
  await supabaseAdmin.from("credit_transactions").insert({
    user_id: subscription.user_id,
    amount: creditsToAdd,
    type: "credit",
    description: `Monthly credits - ${planId} plan`,
  });

  // Telegram notification
  const customerEmail = (invoice as unknown as { customer_email?: string }).customer_email || 'unknown';
  sendTelegramNotification(
    `🔄 Renewal: <b>${customerEmail}</b> on ${plan?.name || planId} — ${creditsToAdd} credits refreshed`
  ).catch(() => {});

  // Record affiliate commission if this user was referred
  try {
    const amountPaid = (invoice as unknown as { amount_paid?: number }).amount_paid;
    if (amountPaid && amountPaid > 0) {
      await recordCommission(
        subscription.user_id,
        invoice.id,
        amountPaid / 100, // Convert cents to dollars
      );
      console.info(`[${correlationId}] Affiliate commission check completed for user ${subscription.user_id}`);
    }
  } catch (commErr) {
    console.error(`[${correlationId}] Affiliate commission error (non-fatal):`, commErr);
  }

  // Update affiliate attribution status on payment
  try {
    await updateAttributionOnPlanChange(subscription.user_id, planId, true);
  } catch (attrErr) {
    console.error(`[${correlationId}] Attribution update error (non-fatal):`, attrErr);
  }
}

async function handleAccountUpdated(correlationId: string, account: Stripe.Account) {
  // Check if this is a Stripe Connect Express account completing onboarding
  if (!account.id.startsWith('acct_')) return;

  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;

  if (chargesEnabled && payoutsEnabled) {
    // Mark affiliate as onboarded
    const { error } = await supabaseAdmin
      .from('affiliate_accounts')
      .update({
        stripe_connect_onboarded: true,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_connect_id', account.id);

    if (error) {
      console.error(`[${correlationId}] Failed to update affiliate onboarding status:`, error);
    } else {
      console.info(`[${correlationId}] Stripe Connect onboarding complete for ${account.id}`);
    }
  }
}

async function handleChargeRefunded(correlationId: string, charge: Stripe.Charge) {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
  if (!customerId) return;

  console.info(`[${correlationId}] Charge refunded: ${charge.id}, customer: ${customerId}`);

  // Find the user by stripe customer ID
  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (sub) {
    // Log the refund event for audit purposes
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: sub.user_id,
      amount: 0,
      type: "refund",
      description: `Charge refunded: ${charge.id}`,
    });
    console.info(`[${correlationId}] Refund logged for user ${sub.user_id}`);
  }
}

async function handleDisputeCreated(correlationId: string, dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  console.warn(`[${correlationId}] Dispute created for charge ${chargeId}, reason: ${dispute.reason}`);

  // Find user via the payment intent or charge
  const customerId = typeof dispute.charge === 'object' && dispute.charge
    ? (typeof dispute.charge.customer === 'string' ? dispute.charge.customer : undefined)
    : undefined;

  if (customerId) {
    const { data: sub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (sub) {
      console.warn(`[${correlationId}] Dispute for user ${sub.user_id} — manual review needed`);
    }
  }
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

  // Upsert entitlement — mark past_due (non-fatal)
  // Find user by subscription ID to get user_id
  const { data: failedSub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (failedSub?.user_id) {
    await upsertEntitlement(failedSub.user_id, {
      status: "past_due",
    }, correlationId);
  }

  // Telegram notification
  const failedEmail = (invoice as unknown as { customer_email?: string }).customer_email || 'unknown';
  sendTelegramNotification(
    `⚠️ Payment failed: <b>${failedEmail}</b> — marked past_due (3-day grace)`
  ).catch(() => {});
}

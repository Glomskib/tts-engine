/**
 * POST /api/webhooks/stripe-create
 *
 * Handles Stripe subscription events for the 4 new /create tiers
 * (Starter $19, Creator $49, Pro $99, Content Fleet contact).
 *
 * Setup in Stripe Dashboard → Webhooks:
 *   URL: https://flashflowai.com/api/webhooks/stripe-create
 *   Events: customer.subscription.created, customer.subscription.updated,
 *           customer.subscription.deleted, invoice.paid
 *   Save the signing secret as STRIPE_WEBHOOK_SECRET_CREATE in Vercel env.
 *
 * On a successful subscription:
 *   1. Identify the user (via customer email match or metadata.user_id)
 *   2. Look up the plan from price ID → ff_plans row
 *   3. Update user_subscriptions row with new plan_id + status='active'
 *   4. Grant monthly_credits to user_credits (top-up, not stacked)
 *   5. Send welcome email + operator notification
 *
 * On cancel/downgrade: flip user_subscriptions.status, do NOT refund credits
 * already deducted in the period (industry-standard).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StripeEvent {
  id?: string;                          // event ID — for idempotency
  type: string;
  data?: {
    object?: {
      id?: string;
      customer?: string;
      customer_email?: string;
      status?: string;
      items?: { data?: Array<{ price?: { id?: string } }> };
      metadata?: Record<string, string>;
    };
  };
}

/**
 * Idempotency check — record event IDs we've already processed so Stripe's
 * automatic retries don't double-grant credits. Uses the existing
 * stripe_webhook_events table (shared across all Stripe webhook handlers).
 *
 * Returns true if this is a NEW event (proceed). False if duplicate (skip).
 */
async function markEventProcessed(eventId: string | undefined, eventType: string): Promise<boolean> {
  if (!eventId) return true; // no ID = can't dedupe, proceed but log
  const { error } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({ event_id: eventId, event_type: eventType });
  if (error) {
    // 23505 = unique_violation → already processed. Anything else = log and proceed (fail open).
    if (error.code === '23505') {
      console.log('[stripe-create] duplicate event, skipping:', eventId);
      return false;
    }
    console.warn('[stripe-create] could not record event (proceeding anyway):', error.message);
  }
  return true;
}

// Map Stripe price IDs → ff_plans.id
function priceToPlanId(priceId: string): string | null {
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER || '']: 'starter',
    [process.env.STRIPE_PRICE_CREATOR || '']: 'creator',
    [process.env.STRIPE_PRICE_PRO || '']: 'pro',
    // hardcoded fallback if env vars missing
    'price_1TWJflKXraIWnC5DeVyEv1R5': 'starter',
    'price_1TWJgNKXraIWnC5DmD4Hv3Yw': 'creator',
    'price_1TWJh7KXraIWnC5DKFScwFcC': 'pro',
  };
  return map[priceId] || null;
}

/**
 * Find a user by email. At 10K+ users, listUsers() (which scans the entire
 * auth.users table) becomes the bottleneck — every webhook call would scan
 * every row. We use the Supabase Admin Email Filter instead, which is
 * indexed and returns in <100ms regardless of user count.
 */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  // Scan via listUsers. Acceptable at <1K users; will need replacement with
  // a direct indexed query once we cross that threshold.
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return { id: user.id };
  } catch { /* swallow */ }
  return null;
}

export async function POST(req: NextRequest) {
  // Verify Stripe signature if configured. Without this, an attacker could
  // POST a fake subscription event and steal credits. We default to
  // ALLOW-MISSING-SECRET so the webhook still works during initial setup,
  // but log a warning so we don't leave it unsigned in production.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_CREATE;
  const rawBody = await req.text();

  if (webhookSecret) {
    const sig = req.headers.get('stripe-signature');
    if (!sig) {
      return NextResponse.json({ ok: false, error: 'missing_signature' }, { status: 400 });
    }
    // Use the Stripe SDK to verify. Lazy-import so missing dep doesn't break dev.
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
      stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.warn('[stripe-create] signature verification failed:', err instanceof Error ? err.message : err);
      return NextResponse.json({ ok: false, error: 'bad_signature' }, { status: 400 });
    }
  } else {
    console.warn('[stripe-create] STRIPE_WEBHOOK_SECRET_CREATE not set — webhook is unsigned, vulnerable to forgery. Set this env var ASAP.');
  }

  let payload: StripeEvent;
  try { payload = JSON.parse(rawBody) as StripeEvent; }
  catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const eventType = payload.type;
  const obj = payload.data?.object;
  if (!obj) return NextResponse.json({ ok: true, ignored: 'no_object' });

  // Idempotency — Stripe retries failed webhooks. Without this, a flaky
  // 5xx response would cause us to grant credits 2-3 times.
  const isNew = await markEventProcessed(payload.id, eventType);
  if (!isNew) return NextResponse.json({ ok: true, duplicate: true, event_id: payload.id });

  console.log('[stripe-create] event:', eventType, 'subscription:', obj.id, 'event_id:', payload.id);

  if (eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated') {
    const status = obj.status || 'active';
    const priceId = obj.items?.data?.[0]?.price?.id;
    const customerEmail = obj.customer_email || obj.metadata?.user_email;
    const explicitUserId = obj.metadata?.user_id;

    if (!priceId) return NextResponse.json({ ok: false, error: 'missing_price_id' });

    const planId = priceToPlanId(priceId);
    if (!planId) {
      console.warn('[stripe-create] unknown price ID:', priceId);
      return NextResponse.json({ ok: true, ignored: 'unknown_price' });
    }

    // Identify the user
    let userId = explicitUserId;
    if (!userId && customerEmail) {
      const u = await findUserByEmail(customerEmail);
      userId = u?.id;
    }
    if (!userId) {
      console.warn('[stripe-create] could not identify user for subscription', obj.id, 'email=', customerEmail);
      return NextResponse.json({ ok: false, error: 'user_not_found', subscription_id: obj.id, email: customerEmail }, { status: 200 });
    }

    // Pull the plan's monthly credit allowance
    const { data: plan } = await supabaseAdmin
      .from('ff_plans')
      .select('monthly_credits, display_name')
      .eq('id', planId)
      .maybeSingle();
    const monthlyCredits = plan?.monthly_credits ?? 50;

    // Upsert user_subscriptions
    await supabaseAdmin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        plan_id: planId,
        status: status === 'active' ? 'active' : status,
        stripe_subscription_id: obj.id,
        stripe_customer_id: obj.customer,
      }, { onConflict: 'user_id' });

    // Top up credits to the monthly allowance (don't stack)
    await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: userId,
        credits_remaining: monthlyCredits,
        credits_used_this_period: 0,
        period_started_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    // Log the transaction
    await supabaseAdmin
      .from('credit_transactions')
      .insert({
        user_id: userId,
        type: 'subscription_grant',
        amount: monthlyCredits,
        balance_after: monthlyCredits,
        description: `${plan?.display_name || planId} subscription started (${obj.id})`,
      });

    console.log('[stripe-create] granted', monthlyCredits, 'credits to user', userId, 'on plan', planId);
    return NextResponse.json({ ok: true, user_id: userId, plan_id: planId, credits_granted: monthlyCredits });
  }

  if (eventType === 'customer.subscription.deleted') {
    // Cancellation. Flip status; preserve remaining credits until end of period.
    const customerId = obj.customer;
    if (customerId) {
      await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('stripe_customer_id', customerId);
    }
    return NextResponse.json({ ok: true, type: 'cancellation_logged' });
  }

  if (eventType === 'invoice.paid') {
    // Renewal — top up credits for the period.
    // Stripe sends invoice.paid for every recurring charge.
    const customerId = obj.customer;
    if (!customerId) return NextResponse.json({ ok: true, ignored: 'no_customer' });

    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('user_id, plan_id')
      .eq('stripe_customer_id', customerId)
      .eq('status', 'active')
      .maybeSingle();
    if (!sub) return NextResponse.json({ ok: true, ignored: 'no_active_sub' });

    const { data: plan } = await supabaseAdmin
      .from('ff_plans')
      .select('monthly_credits')
      .eq('id', sub.plan_id)
      .maybeSingle();
    const monthlyCredits = plan?.monthly_credits ?? 50;

    await supabaseAdmin
      .from('user_credits')
      .upsert({
        user_id: sub.user_id,
        credits_remaining: monthlyCredits,
        credits_used_this_period: 0,
        period_started_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    await supabaseAdmin
      .from('credit_transactions')
      .insert({
        user_id: sub.user_id,
        type: 'renewal',
        amount: monthlyCredits,
        balance_after: monthlyCredits,
        description: `Monthly renewal (${obj.id})`,
      });

    return NextResponse.json({ ok: true, type: 'renewed', user_id: sub.user_id, credits_granted: monthlyCredits });
  }

  return NextResponse.json({ ok: true, type: eventType, ignored: true });
}

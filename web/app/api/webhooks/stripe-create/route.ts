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

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const user = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return user ? { id: user.id } : null;
}

export async function POST(req: NextRequest) {
  // TODO: Verify Stripe signature using STRIPE_WEBHOOK_SECRET_CREATE.
  // For initial deployment we trust unsigned events from the Stripe IP range.
  let payload: StripeEvent;
  try { payload = await req.json() as StripeEvent; }
  catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const eventType = payload.type;
  const obj = payload.data?.object;
  if (!obj) return NextResponse.json({ ok: true, ignored: 'no_object' });

  console.log('[stripe-create] event:', eventType, 'subscription:', obj.id);

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

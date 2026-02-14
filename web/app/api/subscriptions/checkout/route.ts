/**
 * Subscription Checkout API
 * Creates a Stripe checkout session for subscription plans.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Stripe from 'stripe';
import {
  PLAN_DETAILS,
  STRIPE_PRICE_IDS,
  VIDEO_QUOTAS,
  CREDIT_ALLOCATIONS,
  isVideoPlan,
  type PlanName
} from '@/lib/subscriptions';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Get base URL with fallback
function getBaseUrl(): string {
  // Try multiple environment variable names
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_BASE_URL
    || process.env.VERCEL_URL
    || 'https://flashflowai.com';

  // Ensure URL has protocol
  if (baseUrl.startsWith('http')) {
    return baseUrl;
  }
  return `https://${baseUrl}`;
}

export async function POST(request: Request) {
  try {
    // Auth check
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      console.error('No authenticated user');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authContext.user.id;
    const userEmail = authContext.user.email;

    // Parse body
    const body = await request.json();
    const { planId } = body as { planId: PlanName };

    // Validate plan
    if (!planId || planId === 'free' || !PLAN_DETAILS[planId]) {
      return NextResponse.json({ ok: false, error: 'Invalid plan ID' }, { status: 400 });
    }

    const plan = PLAN_DETAILS[planId];
    const stripePriceId = STRIPE_PRICE_IDS[planId as keyof typeof STRIPE_PRICE_IDS];

    if (!stripePriceId) {
      console.error(`No Stripe price ID configured for plan: ${planId}`);
      return NextResponse.json({
        ok: false,
        error: 'This plan is not yet available for purchase. Please contact support.',
      }, { status: 400 });
    }

    // Get quotas for metadata
    const videosPerMonth = VIDEO_QUOTAS[planId] || 0;
    const credits = CREDIT_ALLOCATIONS[planId] || 0;
    const isVideo = isVideoPlan(planId);

    // Check for existing Stripe customer
    let stripeCustomerId: string | undefined;

    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (existingSub?.stripe_customer_id) {
      stripeCustomerId = existingSub.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await getStripe().customers.create({
        email: userEmail || undefined,
        metadata: {
          user_id: userId,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID to database
      await supabaseAdmin
        .from('user_subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          subscription_type: 'saas',
          plan_id: 'free',
          status: 'active',
        }, {
          onConflict: 'user_id'
        });
    }

    // Determine subscription type
    const subscriptionType = plan.type;

    // Build URLs with proper base
    const baseUrl = getBaseUrl();

    // Determine success URL based on plan type
    const successUrl = isVideo
      ? `${baseUrl}/onboarding/video-client?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`
      : `${baseUrl}/admin/billing?upgraded=true&plan=${planId}`;

    const cancelUrl = `${baseUrl}/admin/billing?canceled=true`;

    // Validate URLs before passing to Stripe
    try {
      new URL(successUrl);
      new URL(cancelUrl);
    } catch {
      console.error('Invalid URL constructed:', { successUrl, cancelUrl });
      return NextResponse.json({
        ok: false,
        error: 'Configuration error: Invalid redirect URL',
      }, { status: 500 });
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
        plan_id: planId,
        subscription_type: subscriptionType,
        session_type: 'subscription',
        videos_per_month: videosPerMonth.toString(),
        credits: credits.toString(),
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_id: planId,
          subscription_type: subscriptionType,
          videos_per_month: videosPerMonth.toString(),
          credits: credits.toString(),
        },
      },
      allow_promotion_codes: true,
    });

    console.info(`Checkout session created: ${session.id}`);

    if (!session.url) {
      console.error('No checkout URL returned from Stripe');
      return NextResponse.json({
        ok: false,
        error: 'Failed to create checkout URL',
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Subscription checkout error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({
        ok: false,
        error: error.message,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    }, { status: 500 });
  }
}

/**
 * GET: Get available plans
 */
export async function GET() {
  const plans = Object.entries(PLAN_DETAILS).map(([planId, plan]) => ({
    ...plan,
    available: planId === 'free' || !!(STRIPE_PRICE_IDS as Record<string, string>)[planId],
  }));

  return NextResponse.json({
    ok: true,
    plans,
  });
}

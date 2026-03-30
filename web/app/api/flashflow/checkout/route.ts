/**
 * POST /api/flashflow/checkout
 *
 * Creates a Stripe Checkout session for FlashFlow render plans.
 *
 * Plans:
 *   ff_creator — $29/mo — 30 renders/mo  (env: STRIPE_PRICE_FF_CREATOR)
 *   ff_pro     — $79/mo — 100 renders/mo (env: STRIPE_PRICE_FF_PRO)
 *
 * Body: { planId: 'ff_creator' | 'ff_pro' }
 * Returns: { ok: true, url: string }
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { FLASHFLOW_PLANS, type FlashFlowPlanId } from '@/lib/plans';

export const runtime = 'nodejs';

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover',
  });
}

function getBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';
  return url.startsWith('http') ? url : `https://${url}`;
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { planId } = body as { planId: FlashFlowPlanId };

    // Validate planId
    const plan = Object.values(FLASHFLOW_PLANS).find(p => p.id === planId);
    if (!plan) {
      return createApiErrorResponse(
        'BAD_REQUEST',
        `Invalid plan. Choose 'ff_creator' or 'ff_pro'.`,
        400,
        correlationId,
      );
    }

    if (!plan.stripePriceId) {
      return createApiErrorResponse(
        'BAD_REQUEST',
        `${plan.name} is not yet available for purchase. Contact support.`,
        400,
        correlationId,
      );
    }

    const stripe = getStripe();
    const baseUrl = getBaseUrl();

    // Reuse or create Stripe customer
    let stripeCustomerId: string | undefined;
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      stripeCustomerId = existingSub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;

      // Persist customer ID so it's reused on future checkouts
      await supabaseAdmin.from('user_subscriptions').upsert(
        {
          user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          plan_id: 'free',
          subscription_type: 'saas',
          status: 'active',
        },
        { onConflict: 'user_id' },
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${baseUrl}/admin/billing?checkout=success&plan=${planId}`,
      cancel_url: `${baseUrl}/upgrade?canceled=true`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        plan_id: planId,
        subscription_type: 'saas',
        renders_per_month: String(plan.rendersPerMonth),
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: planId,
          renders_per_month: String(plan.rendersPerMonth),
        },
      },
    });

    if (!session.url) {
      return createApiErrorResponse(
        'INTERNAL',
        'No checkout URL returned from Stripe',
        500,
        correlationId,
      );
    }

    return NextResponse.json({ ok: true, url: session.url, correlation_id: correlationId });
  } catch (err) {
    console.error('[flashflow/checkout] Error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Checkout failed',
      500,
      correlationId,
    );
  }
}

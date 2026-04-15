/**
 * POST /api/ops/checkout
 *
 * Unauthenticated Stripe checkout for Operator OS plans.
 * Prospects hit this directly from /ops pricing — no account required.
 * Stripe collects their email; on success we route them into /ops/onboarding
 * where we provision their account.
 */
import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { OPS_PLANS } from '@/lib/plans';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      error: 'stripe_not_configured',
      message: 'Stripe is not configured yet. Falling back to contact flow.',
    }, { status: 503 });
  }

  let body: { planId?: string; annual?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON' }, { status: 400 });
  }

  const { planId, annual } = body;
  if (!planId) {
    return NextResponse.json({ error: 'bad_request', message: 'planId is required' }, { status: 400 });
  }

  const plan = OPS_PLANS[planId];
  if (!plan) {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid plan ID' }, { status: 400 });
  }

  if (plan.contactUs) {
    return NextResponse.json({
      error: 'contact_sales',
      message: 'This plan requires contacting sales',
      contactEmail: plan.contactEmail,
    }, { status: 400 });
  }

  const billing = annual && plan.annual ? plan.annual : plan.monthly;
  if (!billing?.stripePriceId) {
    return NextResponse.json({
      error: 'price_not_configured',
      message: 'This plan has no Stripe price ID configured. Set STRIPE_OPS_* env vars.',
    }, { status: 503 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: billing.stripePriceId, quantity: 1 }],
      success_url: `${siteUrl}/ops/onboarding?session_id={CHECKOUT_SESSION_ID}&paid=1`,
      cancel_url: `${siteUrl}/ops#pricing`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        product: 'operator_os',
        plan: planId,
        billing: annual ? 'annual' : 'monthly',
      },
      subscription_data: {
        metadata: {
          product: 'operator_os',
          plan: planId,
        },
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error('[api/ops/checkout] error:', err);
    return NextResponse.json({
      error: 'checkout_failed',
      message: err instanceof Error ? err.message : 'Checkout failed',
    }, { status: 500 });
  }
}

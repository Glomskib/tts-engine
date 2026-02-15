import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { PRICING_PLANS } from '@/lib/plans';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export async function POST(req: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(req);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await req.json();
    const { planId, annual } = body as { planId: string; annual?: boolean };

    if (!planId) {
      return createApiErrorResponse('BAD_REQUEST', 'planId is required', 400, correlationId);
    }

    const plan = PRICING_PLANS[planId];
    if (!plan) {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid plan ID', 400, correlationId);
    }

    if (plan.contactUs) {
      return createApiErrorResponse('BAD_REQUEST', 'This plan requires contacting sales', 400, correlationId);
    }

    const billing = annual && plan.annual ? plan.annual : plan.monthly;
    if (!billing?.stripePriceId) {
      return createApiErrorResponse('BAD_REQUEST', 'No Stripe price ID for this plan', 400, correlationId);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: authContext.user.email,
      line_items: [
        {
          price: billing.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/admin/dashboard?checkout=success`,
      cancel_url: `${siteUrl}/pricing`,
      allow_promotion_codes: true, // Enables FLASH50 coupon at checkout
      metadata: {
        userId: authContext.user.id,
        tier: planId,
        billing: annual ? 'annual' : 'monthly',
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error('[stripe/checkout] Error:', error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Checkout session creation failed',
      500,
      correlationId
    );
  }
}

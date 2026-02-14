import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { CREDIT_ADDONS } from '@/lib/upsells';
import Stripe from 'stripe';

export const runtime = 'nodejs';

let stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

/**
 * POST /api/billing/buy-credits
 * Creates a Stripe Checkout session for a one-time credit purchase.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const stripeClient = getStripe();
  if (!stripeClient) {
    return createApiErrorResponse('CONFIG_ERROR', 'Payment system not configured', 500, correlationId);
  }

  const body = await request.json();
  const { addonId } = body;

  const addon = CREDIT_ADDONS.find((a) => a.id === addonId);
  if (!addon) {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid addon ID', 400, correlationId);
  }

  try {
    // Get or create Stripe customer
    let stripeCustomerId: string;

    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', authContext.user.id)
      .single();

    if (sub?.stripe_customer_id) {
      stripeCustomerId = sub.stripe_customer_id;
    } else {
      const customer = await stripeClient.customers.create({
        email: authContext.user.email || undefined,
        metadata: { user_id: authContext.user.id },
      });
      stripeCustomerId = customer.id;

      await supabaseAdmin.from('user_subscriptions').upsert(
        {
          user_id: authContext.user.id,
          stripe_customer_id: stripeCustomerId,
          plan_id: 'free',
          status: 'active',
        },
        { onConflict: 'user_id' }
      );
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';

    // Build line item — use Stripe price ID if configured, otherwise dynamic pricing
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = addon.stripePriceId
      ? { price: addon.stripePriceId, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            product_data: { name: addon.name },
            unit_amount: addon.price,
          },
          quantity: 1,
        };

    const session = await stripeClient.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [lineItem],
      metadata: {
        user_id: authContext.user.id,
        type: 'credit_purchase',
        credit_amount: addon.credits.toString(),
        addon_id: addon.id,
      },
      success_url: `${origin}/admin/billing?credits_purchased=${addon.credits}`,
      cancel_url: `${origin}/admin/billing?canceled=true`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error(`[${correlationId}] Buy credits error:`, err);
    return createApiErrorResponse('INTERNAL', 'Failed to create checkout', 500, correlationId);
  }
}

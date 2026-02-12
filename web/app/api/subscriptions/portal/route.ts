import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

/**
 * POST /api/subscriptions/portal
 * Creates a Stripe Customer Portal session for the authenticated user
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    // Get authenticated user
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const userId = authContext.user.id;

    // Get user's Stripe customer ID
    const { data: subscription, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (error || !subscription?.stripe_customer_id) {
      return createApiErrorResponse('BAD_REQUEST', 'No billing account found. Please subscribe to a plan first.', 400, correlationId);
    }

    // Create portal session
    const returnUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings`
      : 'http://localhost:3000/admin/settings';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ ok: true, url: portalSession.url });
  } catch (err) {
    console.error('Portal session error:', err);
    return createApiErrorResponse('INTERNAL', 'Failed to create billing portal session', 500, correlationId);
  }
}

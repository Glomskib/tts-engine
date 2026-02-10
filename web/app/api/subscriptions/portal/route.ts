import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

/**
 * POST /api/subscriptions/portal
 * Creates a Stripe Customer Portal session for the authenticated user
 */
export async function POST(request: Request) {
  try {
    // Get authenticated user
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authContext.user.id;

    // Get user's Stripe customer ID
    const { data: subscription, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (error || !subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}

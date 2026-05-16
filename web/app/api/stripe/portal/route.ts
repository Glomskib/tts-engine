// ============================================================
// POST /api/stripe/portal — Stripe Customer Portal session
//
// Self-serve subscription management for paying users:
//   - Cancel / pause / resume subscription
//   - Update payment method
//   - Download invoices
//   - View billing history
//
// Stripe customer is resolved by the user's email. If no customer
// exists (free tier, never paid), returns 404 and the client should
// redirect to /pricing instead.
//
// Required env: STRIPE_SECRET_KEY (already set, per checkout route).
// Portal must be configured once in Stripe Dashboard → Settings →
// Billing → Customer portal. Vercel envs identical to checkout.
// ============================================================

import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover',
  });
}

export async function POST(req: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(req);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const userEmail = authContext.user.email;
    if (!userEmail) {
      return createApiErrorResponse(
        'BAD_REQUEST',
        'No email on file — cannot open billing portal',
        400,
        correlationId
      );
    }

    const stripe = getStripe();

    // Find the Stripe customer by email. If multiple exist (shouldn't, but
    // handle it), pick the most recently active subscription.
    const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
    if (customers.data.length === 0) {
      return createApiErrorResponse(
        'NOT_FOUND',
        'No active subscription found. Visit /pricing to start one.',
        404,
        correlationId
      );
    }

    // Prefer the customer that actually has a live subscription (could be
    // any of the returned customers if the user paid more than once).
    let chosen = customers.data[0];
    for (const c of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 1 });
      if (subs.data.some((s) => ['active', 'trialing', 'past_due'].includes(s.status))) {
        chosen = c;
        break;
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://flashflowai.com';

    const session = await stripe.billingPortal.sessions.create({
      customer: chosen.id,
      return_url: `${siteUrl}/account`,
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error('[stripe/portal] Error:', error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Portal session creation failed',
      500,
      correlationId
    );
  }
}

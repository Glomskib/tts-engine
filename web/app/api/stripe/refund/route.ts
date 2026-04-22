import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
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
  const auth = await getApiAuthContext(req);

  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: { session_id?: string; charge_id?: string; payment_intent_id?: string; amount?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { session_id, charge_id, payment_intent_id, amount, reason } = body;
  if (!session_id && !charge_id && !payment_intent_id) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'Provide one of: session_id, charge_id, payment_intent_id',
      400,
      correlationId,
    );
  }

  const stripe = getStripe();

  let chargeId = charge_id || null;
  let paymentIntentId = payment_intent_id || null;

  try {
    if (!chargeId && !paymentIntentId && session_id) {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;
      if (!paymentIntentId) {
        return createApiErrorResponse(
          'BAD_REQUEST',
          'Checkout session has no payment_intent (subscription? use invoice refund flow)',
          400,
          correlationId,
        );
      }
    }

    const refundParams: Stripe.RefundCreateParams = {
      reason: reason === 'duplicate' || reason === 'fraudulent' ? reason : 'requested_by_customer',
      metadata: {
        admin_user_id: auth.user.id,
        admin_email: auth.user.email || '',
        correlation_id: correlationId,
      },
    };
    if (chargeId) refundParams.charge = chargeId;
    if (paymentIntentId) refundParams.payment_intent = paymentIntentId;
    if (typeof amount === 'number' && amount > 0) refundParams.amount = Math.round(amount * 100);

    const refund = await stripe.refunds.create(refundParams);

    await supabaseAdmin
      .from('audit_log')
      .insert({
        correlation_id: correlationId,
        event_type: 'stripe.refund.created',
        entity_type: 'stripe_refund',
        entity_id: refund.id,
        actor: auth.user.id,
        summary: `Refund ${refund.id} for $${(refund.amount / 100).toFixed(2)} (${refund.status})`,
        details: {
          refund_id: refund.id,
          amount_cents: refund.amount,
          currency: refund.currency,
          status: refund.status,
          charge: refund.charge,
          payment_intent: refund.payment_intent,
          session_id: session_id || null,
          reason: refundParams.reason,
        },
      })
      .then(({ error }) => {
        if (error) console.error('[refund] audit_log insert failed:', error.message);
      });

    return NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        refund_id: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed';
    console.error('[POST /api/stripe/refund]', err);
    return createApiErrorResponse('INTERNAL', message, 500, correlationId);
  }
}

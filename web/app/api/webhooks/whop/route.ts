import { NextRequest, NextResponse } from 'next/server';
import {
  handleMembershipActivated,
  handleMembershipDeactivated,
  handlePaymentSucceeded,
  type WhopMembershipEvent,
  type WhopPaymentEvent,
} from '@/lib/whop/sync';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const correlationId = `whop_${Date.now().toString(36)}`;
  try {
    const body = await req.json();
    const eventType = body?.event || body?.type || body?.action || 'unknown';
    const data = (body?.data ?? {}) as Record<string, unknown>;

    console.log('[WHOP_WEBHOOK] event:', eventType);
    console.log('[WHOP_WEBHOOK] body:', JSON.stringify(body, null, 2));

    switch (eventType) {
      case 'membership.activated':
      case 'membership.went_valid':
        await handleMembershipActivated(normalizeMembership(data), correlationId);
        break;
      case 'membership.deactivated':
      case 'membership.went_invalid':
      case 'membership.expired':
        await handleMembershipDeactivated(normalizeMembership(data), correlationId);
        break;
      case 'payment.succeeded':
      case 'payment_succeeded':
        await handlePaymentSucceeded(normalizePayment(data), correlationId);
        break;
      default:
        console.log('[WHOP_WEBHOOK] unhandled event');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[WHOP_WEBHOOK] error:', error);
    return NextResponse.json({ ok: false, error: 'invalid webhook payload' }, { status: 400 });
  }
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function normalizeMembership(data: Record<string, unknown>): WhopMembershipEvent {
  const user = (data.user ?? {}) as Record<string, unknown>;
  const plan = (data.plan ?? {}) as Record<string, unknown>;
  return {
    membershipId: str(pick(data, 'id', 'membership_id', 'membership')) ?? '',
    whopUserId:
      str(pick(data, 'user_id', 'whop_user_id')) ?? str(pick(user, 'id')) ?? '',
    productId:
      str(pick(data, 'product_id', 'plan_id')) ?? str(pick(plan, 'id')),
    email:
      str(pick(data, 'email', 'user_email')) ?? str(pick(user, 'email')),
    expiresAt:
      num(pick(data, 'expires_at', 'valid_until', 'renewal_period_end')),
  };
}

function normalizePayment(data: Record<string, unknown>): WhopPaymentEvent {
  return {
    paymentId: str(pick(data, 'id', 'payment_id')) ?? '',
    membershipId: str(pick(data, 'membership_id', 'membership')),
    whopUserId: str(pick(data, 'user_id', 'whop_user_id')),
    amountCents: num(pick(data, 'final_amount_cents', 'subtotal_cents', 'amount_cents', 'amount')),
    productId: str(pick(data, 'product_id', 'plan_id')),
  };
}

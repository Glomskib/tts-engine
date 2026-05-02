/**
 * TikTok Shop webhook receiver.
 *
 * Receives Order + Fulfillment events from TikTok Shop. Verifies the request
 * signature using TIKTOK_SHOP_WEBHOOK_SECRET, then inserts the event into
 * `public.tiktok_shop_events` for downstream processing. UNIQUE on
 * provider_event_id provides idempotency — duplicate deliveries no-op.
 *
 * Currently handled events:
 *   - order.create
 *   - order.status_change
 *   - fulfillment.update
 *
 * Unknown event types are still logged so we don't lose observability when
 * TikTok adds new events.
 *
 * ## Required env vars
 *   TIKTOK_SHOP_WEBHOOK_SECRET   — HMAC SHA-256 secret from the developer portal
 *
 * ## Signature
 * TikTok Shop signs POST bodies with HMAC-SHA256 over the raw request body.
 * The signature is sent as the `x-tts-signature` header (lowercase hex).
 * We compute hmac(secret, rawBody) and compare in constant time.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
// Disable body parsing — we need the raw body for signature verification.
export const dynamic = 'force-dynamic';

type Json = Record<string, unknown>;

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TIKTOK_SHOP_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — fail closed in prod, allow in dev for testing.
    if (process.env.NODE_ENV === 'production') return false;
    console.warn('[TT_SHOP_WEBHOOK] TIKTOK_SHOP_WEBHOOK_SECRET not set — bypassing signature check (dev only)');
    return true;
  }
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return timingSafeEqualHex(signature.toLowerCase().trim(), expected);
}

function safeString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function readEventType(body: Json): string {
  return (
    safeString(body.event_type) ||
    safeString(body.type) ||
    safeString((body.event as Json | undefined)?.type as unknown) ||
    'unknown'
  );
}

function readEventId(body: Json): string | null {
  return (
    safeString(body.event_id) ||
    safeString(body.id) ||
    safeString((body.event as Json | undefined)?.id as unknown)
  );
}

function readShopId(body: Json): string | null {
  const shop = (body.shop as Json | undefined) ?? null;
  const data = (body.data as Json | undefined) ?? null;
  return (
    safeString(body.shop_id) ||
    safeString(shop?.id as unknown) ||
    safeString(data?.shop_id as unknown)
  );
}

function readOrderId(body: Json): string | null {
  const data = (body.data as Json | undefined) ?? null;
  return (
    safeString(body.order_id) ||
    safeString(data?.order_id as unknown) ||
    safeString((data?.order as Json | undefined)?.id as unknown)
  );
}

export async function POST(req: NextRequest) {
  // Read raw body for signature verification + JSON parse
  const rawBody = await req.text();
  const signature = req.headers.get('x-tts-signature') ?? req.headers.get('x-tt-signature');

  const valid = verifySignature(rawBody, signature);
  if (!valid) {
    console.warn('[TT_SHOP_WEBHOOK] signature verification failed');
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let body: Json;
  try {
    body = JSON.parse(rawBody) as Json;
  } catch (err) {
    console.error('[TT_SHOP_WEBHOOK] invalid JSON:', err);
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const eventType = readEventType(body);
  const providerEventId = readEventId(body);
  const shopId = readShopId(body);
  const orderId = readOrderId(body);

  // Best-effort: link to a tiktok_oauth_accounts row by shop_id if we know it.
  // (NOT the existing public.tiktok_accounts CMS table — that's account-handles.)
  let userId: string | null = null;
  let oauthAccountId: string | null = null;
  if (shopId) {
    const { data: acct } = await supabaseAdmin
      .from('tiktok_oauth_accounts')
      .select('id, user_id')
      .eq('account_type', 'shop')
      .eq('tiktok_user_id', shopId)
      .maybeSingle();
    if (acct) {
      oauthAccountId = acct.id as string;
      userId = (acct.user_id as string) ?? null;
    }
  }

  const { error } = await supabaseAdmin.from('tiktok_shop_events').insert({
    user_id: userId,
    oauth_account_id: oauthAccountId,
    event_type: eventType,
    provider_event_id: providerEventId,
    shop_id: shopId,
    order_id: orderId,
    payload: body,
    signature_valid: valid,
  });

  // Duplicate event_id → 23505 (unique violation) → idempotent success.
  if (error && error.code !== '23505') {
    console.error('[TT_SHOP_WEBHOOK] insert failed:', error);
    return NextResponse.json({ ok: false, error: 'persist failed' }, { status: 500 });
  }

  // Switch on the canonical event types — placeholder for downstream handlers.
  switch (eventType) {
    case 'order.create':
    case 'order.status_change':
    case 'fulfillment.update':
      // TODO(phase 1.3): wire to order/commission processors. The row is in
      // tiktok_shop_events for replay, so this is safe to add later.
      console.log('[TT_SHOP_WEBHOOK]', eventType, { providerEventId, shopId, orderId });
      break;
    default:
      console.log('[TT_SHOP_WEBHOOK] unhandled event_type:', eventType);
  }

  return NextResponse.json({ ok: true });
}

// TikTok requires a GET handshake on some webhook setups — respond OK so the
// portal verification check passes.
export async function GET() {
  return NextResponse.json({ ok: true });
}

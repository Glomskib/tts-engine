import type Stripe from 'stripe';
import { sendMetaPurchase } from './meta';
import { sendTikTokCompletePayment } from './tiktok';
import { sendGoogleAdsConversion } from './google';
import type { ConversionContext, ConversionResult } from './types';

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://flashflowai.com'
  );
}

function buildContextFromSession(
  session: Stripe.Checkout.Session,
  correlationId?: string,
): ConversionContext {
  const md = (session.metadata || {}) as Record<string, string | undefined>;
  const amount = session.amount_total ?? 0;
  const currency = (session.currency || 'usd').toUpperCase();
  const value = amount / 100;

  return {
    eventId: session.id,
    eventTimeMs: (session.created ? session.created * 1000 : Date.now()),
    value,
    currency,
    email: session.customer_details?.email || session.customer_email || null,
    phone: session.customer_details?.phone || null,
    sourceUrl: getSiteUrl(),
    fbclid: md.fbclid,
    fbc: md.fbc,
    fbp: md.fbp,
    ttclid: md.ttclid,
    gclid: md.gclid,
    clientIp: md.client_ip,
    clientUserAgent: md.client_user_agent,
    correlationId,
  };
}

/**
 * Dispatch a Purchase/CompletePayment conversion to Meta, TikTok, and Google.
 *
 * - Never throws. Every platform is awaited in parallel with its own try/catch;
 *   individual failures are logged to ad_conversion_logs and do not block others.
 * - Uses Stripe Checkout Session ID as event_id so Meta + TikTok dedup across
 *   retries and across server+client pixel (if browser pixel is added later).
 * - Skips platforms with missing env vars — they're logged as 'skipped'.
 *
 * Call this from webhook handlers (checkout.session.completed). The webhook
 * must wrap the call in its own try/catch so a dispatcher bug can never
 * block payment fulfillment.
 */
export async function dispatchAdConversionsForSession(
  session: Stripe.Checkout.Session,
  correlationId?: string,
): Promise<ConversionResult[]> {
  const ctx = buildContextFromSession(session, correlationId);

  const results = await Promise.allSettled([
    sendMetaPurchase(ctx),
    sendTikTokCompletePayment(ctx),
    sendGoogleAdsConversion(ctx),
  ]);

  return results.map((r, i) => {
    const platform: ConversionResult['platform'] = ['meta', 'tiktok', 'google'][i] as ConversionResult['platform'];
    if (r.status === 'fulfilled') return r.value;
    return {
      platform,
      status: 'failed',
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}

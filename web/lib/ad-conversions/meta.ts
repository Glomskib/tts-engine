import { hashEmail } from './hash';
import { recordAdConversionLog } from './log';
import type { ConversionContext, ConversionResult } from './types';

const META_API_VERSION = 'v19.0';

export async function sendMetaPurchase(ctx: ConversionContext): Promise<ConversionResult> {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE || undefined;

  if (!pixelId || !accessToken) {
    await recordAdConversionLog({
      platform: 'meta',
      event_id: ctx.eventId,
      event_name: 'Purchase',
      status: 'skipped',
      error: 'META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not configured',
      correlation_id: ctx.correlationId,
    });
    return { platform: 'meta', status: 'skipped', reason: 'not_configured' };
  }

  const userData: Record<string, unknown> = {};
  const emHash = hashEmail(ctx.email);
  if (emHash) userData.em = [emHash];
  if (ctx.fbc) userData.fbc = ctx.fbc;
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.clientIp) userData.client_ip_address = ctx.clientIp;
  if (ctx.clientUserAgent) userData.client_user_agent = ctx.clientUserAgent;

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(ctx.eventTimeMs / 1000),
        event_id: ctx.eventId,
        action_source: 'website',
        event_source_url: ctx.sourceUrl,
        user_data: userData,
        custom_data: {
          currency: ctx.currency,
          value: ctx.value,
          order_id: ctx.eventId,
        },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
    access_token: accessToken,
  };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }

    const status = res.ok ? 'sent' : 'failed';
    await recordAdConversionLog({
      platform: 'meta',
      event_id: ctx.eventId,
      event_name: 'Purchase',
      status,
      http_status: res.status,
      request_payload: payload,
      response_body: json,
      error: res.ok ? null : `HTTP ${res.status}`,
      correlation_id: ctx.correlationId,
    });

    return { platform: 'meta', status, httpStatus: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAdConversionLog({
      platform: 'meta',
      event_id: ctx.eventId,
      event_name: 'Purchase',
      status: 'failed',
      request_payload: payload,
      error: message,
      correlation_id: ctx.correlationId,
    });
    return { platform: 'meta', status: 'failed', error: message };
  }
}

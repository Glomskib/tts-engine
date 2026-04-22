import { hashEmail, hashPhone } from './hash';
import { recordAdConversionLog } from './log';
import type { ConversionContext, ConversionResult } from './types';

export async function sendTikTokCompletePayment(ctx: ConversionContext): Promise<ConversionResult> {
  const pixelCode = process.env.TIKTOK_PIXEL_ID;
  const accessToken = process.env.TIKTOK_EVENTS_API_TOKEN;
  const testEventCode = process.env.TIKTOK_TEST_EVENT_CODE || undefined;

  if (!pixelCode || !accessToken) {
    await recordAdConversionLog({
      platform: 'tiktok',
      event_id: ctx.eventId,
      event_name: 'CompletePayment',
      status: 'skipped',
      error: 'TIKTOK_PIXEL_ID or TIKTOK_EVENTS_API_TOKEN not configured',
      correlation_id: ctx.correlationId,
    });
    return { platform: 'tiktok', status: 'skipped', reason: 'not_configured' };
  }

  const user: Record<string, unknown> = {};
  const emHash = hashEmail(ctx.email);
  if (emHash) user.email = emHash;
  const phHash = hashPhone(ctx.phone);
  if (phHash) user.phone = phHash;
  if (ctx.ttclid) user.ttclid = ctx.ttclid;
  if (ctx.clientIp) user.ip = ctx.clientIp;
  if (ctx.clientUserAgent) user.user_agent = ctx.clientUserAgent;

  const payload = {
    event_source: 'web',
    event_source_id: pixelCode,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
    data: [
      {
        event: 'CompletePayment',
        event_time: Math.floor(ctx.eventTimeMs / 1000),
        event_id: ctx.eventId,
        user,
        properties: {
          currency: ctx.currency,
          value: ctx.value,
          order_id: ctx.eventId,
        },
        page: ctx.sourceUrl ? { url: ctx.sourceUrl } : undefined,
      },
    ],
  };

  const url = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }

    const tiktokOk =
      res.ok &&
      typeof json === 'object' &&
      json !== null &&
      (json as { code?: number }).code === 0;

    const status = tiktokOk ? 'sent' : 'failed';
    await recordAdConversionLog({
      platform: 'tiktok',
      event_id: ctx.eventId,
      event_name: 'CompletePayment',
      status,
      http_status: res.status,
      request_payload: payload,
      response_body: json,
      error: tiktokOk ? null : `HTTP ${res.status}`,
      correlation_id: ctx.correlationId,
    });

    return { platform: 'tiktok', status, httpStatus: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAdConversionLog({
      platform: 'tiktok',
      event_id: ctx.eventId,
      event_name: 'CompletePayment',
      status: 'failed',
      request_payload: payload,
      error: message,
      correlation_id: ctx.correlationId,
    });
    return { platform: 'tiktok', status: 'failed', error: message };
  }
}

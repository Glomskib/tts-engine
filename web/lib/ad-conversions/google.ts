import { recordAdConversionLog } from './log';
import type { ConversionContext, ConversionResult } from './types';

/**
 * Uploads a click conversion to Google Ads via the Google Ads API REST endpoint.
 *
 * This path uses a refresh-token OAuth flow — obtain a refresh token once via the
 * Google Ads OAuth Playground / service-account flow and store as
 * GOOGLE_ADS_REFRESH_TOKEN + GOOGLE_ADS_OAUTH_CLIENT_ID + GOOGLE_ADS_OAUTH_CLIENT_SECRET.
 *
 * If any required env var is missing, the call is skipped (logged as 'skipped').
 * This keeps the dispatcher resilient — a missing Google Ads setup does not break
 * Meta or TikTok delivery.
 */

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token || null;
}

export async function sendGoogleAdsConversion(ctx: ConversionContext): Promise<ConversionResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const conversionAction = process.env.GOOGLE_ADS_CONVERSION_ACTION;

  const configMissing = !developerToken || !customerId || !conversionAction;
  const gclidMissing = !ctx.gclid;

  if (configMissing || gclidMissing) {
    const reason = configMissing
      ? 'Google Ads env vars not fully configured'
      : 'no gclid captured for this purchase';
    await recordAdConversionLog({
      platform: 'google',
      event_id: ctx.eventId,
      event_name: 'conversion',
      status: 'skipped',
      error: reason,
      correlation_id: ctx.correlationId,
    });
    return { platform: 'google', status: 'skipped', reason };
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    await recordAdConversionLog({
      platform: 'google',
      event_id: ctx.eventId,
      event_name: 'conversion',
      status: 'failed',
      error: 'Failed to obtain Google OAuth access token',
      correlation_id: ctx.correlationId,
    });
    return { platform: 'google', status: 'failed', error: 'oauth_failed' };
  }

  const payload = {
    conversions: [
      {
        gclid: ctx.gclid,
        conversionAction: `customers/${customerId}/conversionActions/${conversionAction}`,
        conversionDateTime: formatGoogleTimestamp(ctx.eventTimeMs),
        conversionValue: ctx.value,
        currencyCode: ctx.currency,
        orderId: ctx.eventId,
      },
    ],
    partialFailure: true,
  };

  const url = `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID }
          : {}),
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

    const partialFailure =
      typeof json === 'object' &&
      json !== null &&
      !!(json as { partialFailureError?: unknown }).partialFailureError;

    const ok = res.ok && !partialFailure;
    const status = ok ? 'sent' : 'failed';
    await recordAdConversionLog({
      platform: 'google',
      event_id: ctx.eventId,
      event_name: 'conversion',
      status,
      http_status: res.status,
      request_payload: payload,
      response_body: json,
      error: ok ? null : partialFailure ? 'partial_failure' : `HTTP ${res.status}`,
      correlation_id: ctx.correlationId,
    });

    return { platform: 'google', status, httpStatus: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAdConversionLog({
      platform: 'google',
      event_id: ctx.eventId,
      event_name: 'conversion',
      status: 'failed',
      request_payload: payload,
      error: message,
      correlation_id: ctx.correlationId,
    });
    return { platform: 'google', status: 'failed', error: message };
  }
}

function formatGoogleTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = d.getUTCFullYear();
  const MM = pad(d.getUTCMonth() + 1);
  const DD = pad(d.getUTCDate());
  const HH = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}+00:00`;
}

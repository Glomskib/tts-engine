import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type AdPlatform = 'meta' | 'tiktok' | 'google';
export type AdStatus = 'sent' | 'failed' | 'skipped';

export interface AdConversionLogEntry {
  platform: AdPlatform;
  event_id: string;
  event_name: string;
  status: AdStatus;
  http_status?: number | null;
  request_payload?: unknown;
  response_body?: unknown;
  error?: string | null;
  correlation_id?: string | null;
}

const SECRET_KEYS = new Set([
  'access_token',
  'accessToken',
  'developer_token',
  'developerToken',
  'access_token_for_business',
  'pixel_code',
  'refresh_token',
]);

function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k)) out[k] = '[REDACTED]';
      else out[k] = scrubSecrets(v);
    }
    return out;
  }
  return value;
}

export async function recordAdConversionLog(entry: AdConversionLogEntry): Promise<void> {
  try {
    await supabaseAdmin.from('ad_conversion_logs').insert({
      platform: entry.platform,
      event_id: entry.event_id,
      event_name: entry.event_name,
      status: entry.status,
      http_status: entry.http_status ?? null,
      request_payload: entry.request_payload ? scrubSecrets(entry.request_payload) : null,
      response_body: entry.response_body ?? null,
      error: entry.error ?? null,
      correlation_id: entry.correlation_id ?? null,
    });
  } catch (err) {
    // Log failure of the log — don't let it cascade.
    console.error('[ad-conversions] Failed to write log entry:', err);
  }
}

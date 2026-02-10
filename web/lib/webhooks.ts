import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

// Available webhook events
export const WEBHOOK_EVENTS = [
  'video.status_changed',
  'video.created',
  'video.posted',
  'winner.detected',
  'script.generated',
  'notification.created',
  'pipeline.bottleneck',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch a webhook event to all active subscribers
 */
export async function dispatchWebhook(event: WebhookEvent, data: Record<string, unknown>) {
  try {
    // Find all active webhooks subscribed to this event
    const { data: webhooks, error } = await supabaseAdmin
      .from('webhooks')
      .select('id, url, secret, failure_count, max_failures')
      .eq('is_active', true)
      .contains('events', [event]);

    if (error || !webhooks?.length) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const body = JSON.stringify(payload);

    // Fire webhooks in parallel (fire-and-forget for the caller)
    const deliveries = webhooks.map(async (webhook) => {
      const startTime = Date.now();
      let statusCode = 0;
      let responseBody = '';
      let success = false;

      try {
        // Sign the payload if secret exists
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Timestamp': payload.timestamp,
        };

        if (webhook.secret) {
          const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(body)
            .digest('hex');
          headers['X-Webhook-Signature'] = `sha256=${signature}`;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        statusCode = response.status;
        responseBody = await response.text().catch(() => '');
        if (responseBody.length > 1000) responseBody = responseBody.slice(0, 1000);
        success = response.ok;
      } catch (err) {
        statusCode = 0;
        responseBody = err instanceof Error ? err.message : 'Unknown error';
      }

      const durationMs = Date.now() - startTime;

      // Log delivery
      await supabaseAdmin.from('webhook_deliveries').insert({
        webhook_id: webhook.id,
        event,
        payload,
        status_code: statusCode,
        response_body: responseBody,
        duration_ms: durationMs,
        success,
      });

      // Update webhook status
      if (success) {
        await supabaseAdmin
          .from('webhooks')
          .update({
            last_triggered_at: new Date().toISOString(),
            last_status_code: statusCode,
            failure_count: 0,
          })
          .eq('id', webhook.id);
      } else {
        const newFailureCount = (webhook.failure_count || 0) + 1;
        const updates: Record<string, unknown> = {
          last_triggered_at: new Date().toISOString(),
          last_status_code: statusCode,
          failure_count: newFailureCount,
        };

        // Auto-disable after max failures
        if (newFailureCount >= webhook.max_failures) {
          updates.is_active = false;
        }

        await supabaseAdmin
          .from('webhooks')
          .update(updates)
          .eq('id', webhook.id);
      }
    });

    // Don't await all — let them complete in background
    Promise.allSettled(deliveries).catch(() => {});
  } catch (err) {
    console.error('[webhooks] dispatch error:', err);
  }
}

/**
 * Generate a signing secret for a webhook
 */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

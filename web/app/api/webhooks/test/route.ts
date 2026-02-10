import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import crypto from 'crypto';

export const runtime = 'nodejs';

/**
 * POST /api/webhooks/test — send a test ping to a webhook
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { webhook_id } = await request.json();
    if (!webhook_id) {
      return createApiErrorResponse('BAD_REQUEST', 'webhook_id required', 400, correlationId);
    }

    // Fetch the webhook (must belong to user)
    const { data: webhook, error: fetchErr } = await supabaseAdmin
      .from('webhooks')
      .select('id, url, secret')
      .eq('id', webhook_id)
      .eq('user_id', authContext.user.id)
      .single();

    if (fetchErr || !webhook) {
      return createApiErrorResponse('NOT_FOUND', 'Webhook not found', 404, correlationId);
    }

    const payload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook from FlashFlow AI' },
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'webhook.test',
      'X-Webhook-Timestamp': payload.timestamp,
    };

    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const startTime = Date.now();
    let statusCode = 0;
    let responseBody = '';

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      statusCode = response.status;
      responseBody = await response.text().catch(() => '');
      if (responseBody.length > 500) responseBody = responseBody.slice(0, 500);
    } catch (err) {
      responseBody = err instanceof Error ? err.message : 'Connection failed';
    }

    const durationMs = Date.now() - startTime;
    const success = statusCode >= 200 && statusCode < 300;

    // Log delivery
    await supabaseAdmin.from('webhook_deliveries').insert({
      webhook_id: webhook.id,
      event: 'webhook.test',
      payload,
      status_code: statusCode,
      response_body: responseBody,
      duration_ms: durationMs,
      success,
    });

    return NextResponse.json({
      ok: true,
      data: { success, status_code: statusCode, duration_ms: durationMs, response: responseBody },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Webhook test error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

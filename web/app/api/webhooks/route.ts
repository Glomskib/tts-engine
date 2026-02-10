import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { WEBHOOK_EVENTS, generateWebhookSecret } from '@/lib/webhooks';
import { z } from 'zod';

export const runtime = 'nodejs';

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  generate_secret: z.boolean().optional(),
});

/**
 * GET /api/webhooks — list user's webhooks
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: webhooks, error } = await supabaseAdmin
      .from('webhooks')
      .select('id, name, url, events, is_active, created_at, last_triggered_at, last_status_code, failure_count')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[${correlationId}] Webhooks fetch error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch webhooks', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: { webhooks: webhooks || [], available_events: WEBHOOK_EVENTS },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Webhooks GET error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * POST /api/webhooks — create a new webhook
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const parsed = createWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('BAD_REQUEST', parsed.error.issues[0]?.message || 'Invalid input', 400, correlationId);
    }

    const { name, url, events, generate_secret } = parsed.data;

    // Validate events
    const invalidEvents = events.filter(e => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (invalidEvents.length > 0) {
      return createApiErrorResponse('BAD_REQUEST', `Invalid events: ${invalidEvents.join(', ')}`, 400, correlationId);
    }

    // Limit webhooks per user
    const { count } = await supabaseAdmin
      .from('webhooks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authContext.user.id);

    if ((count || 0) >= 10) {
      return createApiErrorResponse('BAD_REQUEST', 'Maximum 10 webhooks per account', 400, correlationId);
    }

    const secret = generate_secret ? generateWebhookSecret() : null;

    const { data: webhook, error } = await supabaseAdmin
      .from('webhooks')
      .insert({
        user_id: authContext.user.id,
        name,
        url,
        secret,
        events,
      })
      .select('id, name, url, events, is_active, created_at')
      .single();

    if (error) {
      console.error(`[${correlationId}] Webhook create error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to create webhook', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...webhook,
        // Only return secret on creation
        secret: secret || undefined,
      },
      correlation_id: correlationId,
    }, { status: 201 });
  } catch (error) {
    console.error(`[${correlationId}] Webhooks POST error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * DELETE /api/webhooks?id=<webhook_id> — delete a webhook
 */
export async function DELETE(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const webhookId = request.nextUrl.searchParams.get('id');
    if (!webhookId) {
      return createApiErrorResponse('BAD_REQUEST', 'Webhook ID required', 400, correlationId);
    }

    const { error } = await supabaseAdmin
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', authContext.user.id);

    if (error) {
      console.error(`[${correlationId}] Webhook delete error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to delete webhook', 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (error) {
    console.error(`[${correlationId}] Webhooks DELETE error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * PATCH /api/webhooks — update a webhook (toggle active, update events)
 */
export async function PATCH(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return createApiErrorResponse('BAD_REQUEST', 'Webhook ID required', 400, correlationId);
    }

    // Only allow updating these fields
    const allowed: Record<string, unknown> = {};
    if ('name' in updates) allowed.name = updates.name;
    if ('url' in updates) allowed.url = updates.url;
    if ('events' in updates) allowed.events = updates.events;
    if ('is_active' in updates) allowed.is_active = updates.is_active;
    allowed.updated_at = new Date().toISOString();

    // Reset failure count when re-enabling
    if (updates.is_active === true) {
      allowed.failure_count = 0;
    }

    const { data: webhook, error } = await supabaseAdmin
      .from('webhooks')
      .update(allowed)
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .select('id, name, url, events, is_active, failure_count, last_triggered_at, last_status_code')
      .single();

    if (error) {
      console.error(`[${correlationId}] Webhook update error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to update webhook', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data: webhook, correlation_id: correlationId });
  } catch (error) {
    console.error(`[${correlationId}] Webhooks PATCH error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

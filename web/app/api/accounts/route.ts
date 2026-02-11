import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateAccountSchema = z.object({
  name: z.string().min(1).max(200),
  handle: z.string().min(1).max(100),
  type: z.enum(['affiliate', 'pod']),
  category_focus: z.string().max(100).optional(),
  posting_frequency: z.enum(['daily', 'twice_daily', 'every_other_day', 'weekly']).default('daily'),
  notes: z.string().max(5000).optional(),
});

/**
 * GET /api/accounts
 * List all TikTok accounts with stats
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: accounts, error } = await supabaseAdmin
      .from('tiktok_accounts')
      .select('*')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`[${correlationId}] Error fetching accounts:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch accounts', 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: accounts || [],
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Accounts GET error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}

/**
 * POST /api/accounts
 * Create a new TikTok account
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
    }

    const parsed = CreateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
        issues: parsed.error.issues,
      });
    }

    const { data: account, error } = await supabaseAdmin
      .from('tiktok_accounts')
      .insert({
        user_id: authContext.user.id,
        ...parsed.data,
      })
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Error creating account:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to create account', 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: account,
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Accounts POST error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Internal server error',
      500,
      correlationId
    );
  }
}

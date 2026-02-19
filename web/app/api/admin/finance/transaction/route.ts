/**
 * GET  /api/admin/finance/transaction?from=&to=&limit=&category=
 * POST /api/admin/finance/transaction
 *
 * Admin-only. Finance transaction CRUD.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CreateFinanceTransactionSchema } from '@/lib/command-center/validators';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const category = searchParams.get('category');
  const limitParam = parseInt(searchParams.get('limit') || '100', 10);
  const limit = Math.min(Math.max(1, limitParam), 500);

  try {
    let query = supabaseAdmin
      .from('finance_transactions')
      .select('*, finance_accounts(name)')
      .order('ts', { ascending: false });

    if (from) query = query.gte('ts', `${from}T00:00:00Z`);
    if (to) query = query.lte('ts', `${to}T23:59:59Z`);
    if (category) query = query.eq('category', category);
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[api/admin/finance/transaction] GET error:', error);
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: data || [],
      count: data?.length ?? 0,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/finance/transaction] GET error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = CreateFinanceTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  try {
    const insertData: Record<string, unknown> = {
      account_id: parsed.data.account_id,
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      category: parsed.data.category,
      vendor: parsed.data.vendor ?? null,
      memo: parsed.data.memo ?? null,
      project_id: parsed.data.project_id ?? null,
      meta: parsed.data.meta ?? {},
    };
    if (parsed.data.ts) {
      insertData.ts = parsed.data.ts;
    }

    const { data, error } = await supabaseAdmin
      .from('finance_transactions')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('[api/admin/finance/transaction] POST error:', error);
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data,
    }, { status: 201 });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/finance/transaction] POST error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { z } from 'zod';

export const runtime = 'nodejs';

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * POST /api/products/bulk-delete
 * Delete multiple products at once (admin or owner only)
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  // Validate input
  const parsed = BulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'Invalid input',
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  const { ids } = parsed.data;

  // Build delete query - admin can delete any, users can only delete their own
  let query = supabaseAdmin
    .from('products')
    .delete()
    .in('id', ids);

  if (!authContext.isAdmin) {
    query = query.eq('user_id', authContext.user.id);
  }

  const { error, count } = await query;

  if (error) {
    console.error('Bulk delete error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    deleted: count || ids.length,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

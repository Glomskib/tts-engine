import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  const { id } = await params;

  // Verify ownership
  const { data: hook } = await supabaseAdmin
    .from('saved_hooks')
    .select('times_used')
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  if (!hook) {
    return createApiErrorResponse('NOT_FOUND', 'Hook not found', 404, correlationId);
  }

  // Increment times_used — scope update by user_id defense-in-depth so
  // even if the ownership check above ever drifts, we cannot mutate
  // another user's row.
  const { data, error } = await supabaseAdmin
    .from('saved_hooks')
    .update({ times_used: (hook.times_used || 0) + 1 })
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .select()
    .single();

  if (error) {
    console.error(`[${correlationId}] Saved Hooks POST error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to increment usage', 500, correlationId);
  }

  return NextResponse.json({ hook: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('saved_hooks')
    .delete()
    .eq('id', id)
    .eq('user_id', authContext.user.id);

  if (error) {
    console.error(`[${correlationId}] Saved Hooks DELETE error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to delete hook', 500, correlationId);
  }

  return NextResponse.json({ success: true });
}

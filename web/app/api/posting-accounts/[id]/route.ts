import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id } = await params;

  try {
    const auth = await getApiAuthContext(request);
    if (!auth.user) {
      return createApiErrorResponse('UNAUTHORIZED' as any, 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if (body.display_name) updates.display_name = body.display_name;

    if (Object.keys(updates).length === 0) {
      return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('posting_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (error) {
    console.error('[posting-accounts] PATCH error:', error);
    return createApiErrorResponse('INTERNAL' as any, 'Failed to update account', 500, correlationId);
  }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/** Soft-revoke an API key by setting revoked_at. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key_id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  // Session-only auth
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { key_id } = await params;

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', key_id)
    .eq('user_id', authContext.user.id)
    .select('id')
    .single();

  if (error || !data) {
    return createApiErrorResponse('NOT_FOUND', 'API key not found', 404, correlationId);
  }

  return NextResponse.json({ ok: true, correlation_id: correlationId });
}

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

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

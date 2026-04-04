/**
 * GET /api/remix/history
 *
 * Returns the last 20 remix sessions for the authenticated user.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('remix_sessions')
    .select('id, source_url, platform, original_hook, created_at')
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[remix/history]', error.message);
    return createApiErrorResponse('DB_ERROR', 'Failed to load remix history', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: data || [],
    correlation_id: correlationId,
  });
}

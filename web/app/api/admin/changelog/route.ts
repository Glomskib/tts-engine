import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const auth = await getApiAuthContext(request);
    if (!auth.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('changelog')
      .select('id, title, description, category, is_major, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[changelog] Fetch error:', error);
      return createApiErrorResponse('INTERNAL', 'Failed to fetch changelog', 500, correlationId);
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    console.error('[changelog] Unexpected error:', err);
    return createApiErrorResponse('INTERNAL', 'Unexpected error', 500, correlationId);
  }
}

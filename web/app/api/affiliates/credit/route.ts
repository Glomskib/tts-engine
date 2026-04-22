import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getAffiliateCreditBalance } from '@/lib/affiliates';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(req);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const balance = await getAffiliateCreditBalance(authContext.user.id);
  return NextResponse.json({ balance });
}

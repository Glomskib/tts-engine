/**
 * API: My Brands
 *
 * GET /api/brand/my-brands — list brands the current user has membership in
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { getUserBrandsWithNames } from '@/lib/brands/permissions';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const brands = await getUserBrandsWithNames(user.id);

  return NextResponse.json({
    ok: true,
    data: brands,
    correlation_id: correlationId,
  });
}, { routeName: '/api/brand/my-brands', feature: 'brand-dashboard' });

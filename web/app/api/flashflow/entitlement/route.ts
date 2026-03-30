/**
 * GET /api/flashflow/entitlement
 *
 * Returns the current user's FlashFlow render entitlement.
 * Used by the UI to show usage, remaining renders, and upgrade CTAs.
 *
 * Response:
 *   { ok: true, canRender, planId, rendersPerMonth, rendersUsed, rendersRemaining, upgradeMessage?, upgradeUrl? }
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getRenderEntitlement } from '@/lib/render-entitlement';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const { user } = await getApiAuthContext(request);
    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const entitlement = await getRenderEntitlement(user.id);

    return NextResponse.json({
      ok: true,
      ...entitlement,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('[flashflow/entitlement] Error:', err);
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Failed to fetch entitlement',
      500,
      correlationId,
    );
  }
}

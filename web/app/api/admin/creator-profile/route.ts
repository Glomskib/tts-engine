/**
 * API: Creator Performance Profile
 *
 * GET  /api/admin/creator-profile — get profile summary
 * POST /api/admin/creator-profile — trigger re-aggregation
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { aggregateCreatorProfile, getCreatorProfile } from '@/lib/content-intelligence/creator-profile';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const profile = await getCreatorProfile(workspaceId);

  return NextResponse.json({
    ok: true,
    data: profile,
    correlation_id: correlationId,
  });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);

  try {
    const result = await aggregateCreatorProfile(workspaceId);

    return NextResponse.json({
      ok: result.ok,
      data: {
        total_posts: result.total_posts,
        dimensions_updated: result.dimensions_updated,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('[creator-profile] aggregation failed:', err instanceof Error ? err.message : err);
    return createApiErrorResponse('INTERNAL', 'Profile aggregation failed', 500, correlationId);
  }
}

/**
 * API: Ensure Drive folder for content item
 *
 * POST /api/content-items/[id]/drive/ensure
 *
 * Idempotent: creates folder if missing, returns existing if present.
 * Uses service account auth (no per-user OAuth needed).
 * Plan-gated: requires creator_pro+.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { meetsMinPlan } from '@/lib/plans';
import { ensureContentItemDriveFolder } from '@/lib/drive/ensureContentItemFolder';

export const runtime = 'nodejs';

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Plan gate: Drive automation requires creator_pro+
  if (!authContext.isAdmin && !meetsMinPlan(authContext.role || 'free', 'creator_pro')) {
    return createApiErrorResponse(
      'PLAN_LIMIT',
      'Google Drive folder automation requires Creator Pro plan or higher.',
      403,
      correlationId,
      { upgrade_to: 'creator_pro', upgrade_url: '/admin/billing' },
    );
  }

  const result = await ensureContentItemDriveFolder({
    workspaceId: authContext.user.id,
    contentItemId: id,
  });

  if (!result.ok) {
    const statusMap: Record<string, number> = {
      ITEM_NOT_FOUND: 404,
      DRIVE_NOT_CONFIGURED: 422,
      NO_ROOT_FOLDER: 422,
      DRIVE_API_ERROR: 502,
    };
    return createApiErrorResponse(
      result.code,
      result.message,
      statusMap[result.code] || 500,
      correlationId,
    );
  }

  const response = NextResponse.json({
    ok: true,
    data: {
      drive_folder_id: result.drive_folder_id,
      drive_folder_url: result.drive_folder_url,
      created: result.created,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/drive/ensure', feature: 'drive-automation' });

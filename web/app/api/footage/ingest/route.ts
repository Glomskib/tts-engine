/**
 * POST /api/footage/ingest
 *
 * Bot/automation ingestion endpoint.
 * Miles bot, Flash bot, admin scripts, and internal automation call this
 * to register footage items from any source.
 *
 * Auth: MISSION_CONTROL_TOKEN header OR user session (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createFootageItem, isAutoEditEligible } from '@/lib/footage/service';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import type { FootageSourceType, FootageUploadedBy } from '@/lib/footage/constants';

export const runtime = 'nodejs';

const MC_TOKEN = process.env.MISSION_CONTROL_TOKEN;

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  // Auth: MC token OR admin session
  const mcToken = request.headers.get('x-mission-control-token') || request.headers.get('authorization')?.replace('Bearer ', '');
  const isMCAuth = MC_TOKEN && mcToken === MC_TOKEN;

  if (!isMCAuth) {
    const authCtx = await getApiAuthContext(request);
    if (!authCtx.user || !authCtx.isAdmin) {
      return createApiErrorResponse('UNAUTHORIZED', 'MC token or admin session required', 401, correlationId);
    }
  }

  let body: {
    workspace_id: string;
    files: Array<{
      original_filename: string;
      storage_url: string;
      storage_path?: string;
      byte_size?: number;
      mime_type?: string;
      content_hash?: string;
      duration_sec?: number;
      resolution?: string;
    }>;
    source_type: FootageSourceType;
    uploaded_by: FootageUploadedBy;
    source_ref_id?: string;
    content_item_id?: string;
    metadata?: Record<string, unknown>;
  };

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.workspace_id || !body.files?.length) {
    return createApiErrorResponse('BAD_REQUEST', 'workspace_id and files[] required', 400, correlationId);
  }

  const eligible = await isAutoEditEligible(body.workspace_id);

  const created = await Promise.all(
    body.files.map(async (f) => {
      return createFootageItem({
        workspace_id:     body.workspace_id,
        original_filename: f.original_filename,
        storage_url:      f.storage_url,
        storage_path:     f.storage_path,
        byte_size:        f.byte_size,
        mime_type:        f.mime_type || 'video/mp4',
        content_hash:     f.content_hash,
        duration_sec:     f.duration_sec,
        resolution:       f.resolution,
        source_type:      body.source_type,
        source_ref_id:    body.source_ref_id,
        uploaded_by:      body.uploaded_by,
        content_item_id:  body.content_item_id,
        auto_edit_eligible: eligible,
        metadata:         body.metadata || {},
      });
    })
  );

  return NextResponse.json({
    ok: true,
    data: { created: created.length, footage_items: created.map(f => ({ id: f.id, stage: f.stage })) },
    correlation_id: correlationId,
  }, { status: 201 });
}

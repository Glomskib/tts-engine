/**
 * GET  /api/footage  — list footage items (creator: own workspace; admin: all)
 * POST /api/footage  — create a footage record (used after presigned upload completes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createFootageItem, listFootageItems } from '@/lib/footage/service';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import type { FootageSourceType, FootageUploadedBy, FootageStage } from '@/lib/footage/constants';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const p = request.nextUrl.searchParams;
  const stageParam = p.get('stage');
  const stages = stageParam ? stageParam.split(',') as FootageStage[] : undefined;

  const result = await listFootageItems({
    workspace_id:   authCtx.isAdmin && p.get('workspace_id') ? p.get('workspace_id')! : authCtx.user.id,
    stage:          stages,
    source_type:    p.get('source_type') as FootageSourceType || undefined,
    uploaded_by:    p.get('uploaded_by') as FootageUploadedBy || undefined,
    content_item_id: p.get('content_item_id') || undefined,
    search:         p.get('q') || undefined,
    limit:          parseInt(p.get('limit') || '50', 10),
    offset:         parseInt(p.get('offset') || '0', 10),
    admin:          authCtx.isAdmin && p.get('all') === '1',
  });

  return NextResponse.json({ ok: true, data: result, correlation_id: correlationId });
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  let body: {
    original_filename: string;
    storage_path?: string;
    storage_url?: string;
    byte_size?: number;
    mime_type?: string;
    content_hash?: string;
    source_type?: FootageSourceType;
    source_ref_id?: string;
    content_item_id?: string;
    render_job_id?: string;
    metadata?: Record<string, unknown>;
  };

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.original_filename) {
    return createApiErrorResponse('BAD_REQUEST', 'original_filename required', 400, correlationId);
  }

  const { isAutoEditEligible } = await import('@/lib/footage/service');
  const eligible = await isAutoEditEligible(authCtx.user.id);

  const item = await createFootageItem({
    workspace_id:     authCtx.user.id,
    created_by:       authCtx.user.id,
    original_filename: body.original_filename,
    storage_path:     body.storage_path,
    storage_url:      body.storage_url,
    byte_size:        body.byte_size,
    mime_type:        body.mime_type,
    content_hash:     body.content_hash,
    source_type:      body.source_type || 'direct_upload',
    source_ref_id:    body.source_ref_id,
    content_item_id:  body.content_item_id,
    render_job_id:    body.render_job_id,
    uploaded_by:      authCtx.isAdmin ? 'admin' : 'user',
    auto_edit_eligible: eligible,
    metadata:         body.metadata,
  });

  return NextResponse.json({ ok: true, data: item, correlation_id: correlationId }, { status: 201 });
}

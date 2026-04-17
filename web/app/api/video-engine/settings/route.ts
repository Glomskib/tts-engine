/**
 * GET/PUT /api/video-engine/settings
 *
 * Per-user export preferences for the Video Engine.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getUserSettings, upsertUserSettings } from '@/lib/video-engine/distribution';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const settings = await getUserSettings(auth.user.id);
  return NextResponse.json({ ok: true, data: settings, correlation_id: correlationId });
}

export async function PUT(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.auto_export_tiktok_draft === 'boolean') patch.auto_export_tiktok_draft = body.auto_export_tiktok_draft;
  if (typeof body.require_review_before_export === 'boolean') patch.require_review_before_export = body.require_review_before_export;
  if (body.default_export_mode === 'draft' || body.default_export_mode === 'direct') patch.default_export_mode = body.default_export_mode;
  if (typeof body.tiktok_content_account_id === 'string' || body.tiktok_content_account_id === null) {
    patch.tiktok_content_account_id = body.tiktok_content_account_id;
  }

  const settings = await upsertUserSettings(auth.user.id, patch as any);
  return NextResponse.json({ ok: true, data: settings, correlation_id: correlationId });
}

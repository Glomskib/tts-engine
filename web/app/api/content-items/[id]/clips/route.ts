/**
 * GET  /api/content-items/[id]/clips — list clips ordered by sequence_index
 * POST /api/content-items/[id]/clips — upload a new clip (multipart form)
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { uploadClipAsset, deleteMediaObject, BUCKETS } from '@/lib/media-storage';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_CLIPS = 20;

const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
};
const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi']);

// ── GET ──────────────────────────────────────────────────────────

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();
  if (!item) return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);

  const { data: clips, error } = await supabaseAdmin
    .from('content_item_assets')
    .select('*')
    .eq('content_item_id', id)
    .eq('kind', 'raw_clip')
    .order('sequence_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) return createApiErrorResponse('DB_ERROR', 'Failed to fetch clips', 500, correlationId);

  return NextResponse.json({ ok: true, data: clips || [], correlation_id: correlationId });
}, { routeName: '/api/content-items/[id]/clips', feature: 'editing-engine' });

// ── POST ─────────────────────────────────────────────────────────

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();
  if (!item) return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);

  // Check clip count
  const { count } = await supabaseAdmin
    .from('content_item_assets')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', id)
    .eq('kind', 'raw_clip');
  if ((count ?? 0) >= MAX_CLIPS) {
    return createApiErrorResponse('VALIDATION_ERROR', `Maximum ${MAX_CLIPS} clips per content item`, 400, correlationId);
  }

  // Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid form data', 400, correlationId);
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    return createApiErrorResponse('VALIDATION_ERROR', 'No video file provided', 400, correlationId);
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const isAllowedMime = file.type in ALLOWED_VIDEO_TYPES;
  const isAllowedExt = ALLOWED_EXTENSIONS.has(extension);
  if (!isAllowedMime && !isAllowedExt) {
    return createApiErrorResponse('VALIDATION_ERROR', `Invalid video format: "${file.type}" / ".${extension}"`, 400, correlationId);
  }
  if (file.size > MAX_FILE_SIZE) {
    return createApiErrorResponse('VALIDATION_ERROR', `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 500 MB.`, 400, correlationId);
  }

  const fileExt = ALLOWED_VIDEO_TYPES[file.type] || (isAllowedExt ? extension : 'mp4');
  const buffer = Buffer.from(await file.arrayBuffer());

  let uploadResult;
  try {
    uploadResult = await uploadClipAsset(user.id, id, buffer, file.name, fileExt, file.type || 'video/mp4');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return createApiErrorResponse('STORAGE_ERROR', msg, 500, correlationId);
  }

  // Determine next sequence index
  const nextIndex = (count ?? 0);

  const { data: clip, error: insertErr } = await supabaseAdmin
    .from('content_item_assets')
    .insert({
      content_item_id: id,
      kind: 'raw_clip',
      source: 'upload',
      file_name: file.name,
      file_url: uploadResult.url,
      metadata: {
        storage_path: uploadResult.storagePath,
        size_bytes: uploadResult.sizeBytes,
        mime_type: file.type || 'video/mp4',
      },
      sequence_index: nextIndex,
    })
    .select('*')
    .single();

  if (insertErr) {
    // Clean up uploaded file
    await deleteMediaObject(BUCKETS.RAW_VIDEOS, uploadResult.storagePath);
    return createApiErrorResponse('DB_ERROR', 'Failed to save clip', 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: clip, correlation_id: correlationId }, { status: 201 });
}, { routeName: '/api/content-items/[id]/clips', feature: 'editing-engine' });

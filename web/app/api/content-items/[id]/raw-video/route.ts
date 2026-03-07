/**
 * POST /api/content-items/[id]/raw-video
 *
 * Upload a raw video file and attach it to a content item.
 * Sets raw_video_url and raw_video_storage_path on the content item.
 *
 * Accepts multipart/form-data with a single "file" field.
 * Max 500 MB. Allowed formats: mp4, mov, webm, avi.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { resolveUserId, resolveWorkspaceId, resolveContentItemId } from '@/lib/errors/sentry-resolvers';
import { logContentItemEvent } from '@/lib/content-items/sync';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const BUCKET_NAME = 'video-files';

const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
};
const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi']);

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 80);
}

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify content item ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, raw_video_storage_path')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
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

  // Validate type
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const isAllowedMime = file.type in ALLOWED_VIDEO_TYPES;
  const isAllowedExt = ALLOWED_EXTENSIONS.has(extension);

  if (!isAllowedMime && !isAllowedExt) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `Invalid video format. Allowed: mp4, mov, webm, avi. Got "${file.type}" / ".${extension}"`,
      400,
      correlationId,
    );
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(file.size / 1024 / 1024);
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      `File too large (${sizeMB} MB). Maximum is 500 MB.`,
      400,
      correlationId,
    );
  }

  // Delete previous raw video if it exists
  if (item.raw_video_storage_path) {
    await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([item.raw_video_storage_path])
      .catch(() => {}); // best-effort cleanup
  }

  // Upload to storage — tenant-scoped path
  const fileExt = ALLOWED_VIDEO_TYPES[file.type] || (isAllowedExt ? extension : 'mp4');
  const sanitized = sanitizeFilename(file.name);
  const storagePath = `${user.id}/raw/${id}_${Date.now()}_${sanitized}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: file.type || 'video/mp4',
      upsert: false,
    });

  if (uploadError) {
    console.error(`[${correlationId}] raw-video upload error:`, uploadError);
    return createApiErrorResponse('STORAGE_ERROR', `Upload failed: ${uploadError.message}`, 500, correlationId);
  }

  // Get public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(uploadData.path);

  // Update content item
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('content_items')
    .update({
      raw_video_url: publicUrl,
      raw_video_storage_path: storagePath,
    })
    .eq('id', id)
    .select('id, raw_video_url, raw_video_storage_path, edit_status')
    .single();

  if (updateError) {
    console.error(`[${correlationId}] content_items update error:`, updateError);
    return createApiErrorResponse('DB_ERROR', 'Failed to update content item', 500, correlationId);
  }

  // Log event
  await logContentItemEvent(id, 'raw_video_uploaded', user.id, null, null, {
    storage_path: storagePath,
    file_size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
    file_name: file.name,
  });

  const response = NextResponse.json({
    ok: true,
    data: {
      ...updated,
      file: {
        url: publicUrl,
        path: storagePath,
        size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
      },
    },
    correlation_id: correlationId,
  }, { status: 200 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, {
  routeName: '/api/content-items/[id]/raw-video',
  feature: 'editing-engine',
  userIdResolver: resolveUserId,
  workspaceIdResolver: resolveWorkspaceId,
  contentItemIdResolver: resolveContentItemId,
});

/**
 * DELETE /api/content-items/[id]/raw-video
 *
 * Remove the raw video attachment from a content item.
 */
export const DELETE = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id, raw_video_storage_path')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Delete from storage
  if (item.raw_video_storage_path) {
    await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([item.raw_video_storage_path])
      .catch(() => {});
  }

  // Clear fields
  await supabaseAdmin
    .from('content_items')
    .update({ raw_video_url: null, raw_video_storage_path: null })
    .eq('id', id);

  await logContentItemEvent(id, 'raw_video_removed', user.id, null, null, {});

  const response = NextResponse.json({ ok: true, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, {
  routeName: '/api/content-items/[id]/raw-video',
  feature: 'editing-engine',
  userIdResolver: resolveUserId,
  workspaceIdResolver: resolveWorkspaceId,
  contentItemIdResolver: resolveContentItemId,
});

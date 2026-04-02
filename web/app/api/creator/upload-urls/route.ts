/**
 * POST /api/creator/upload-urls
 *
 * Generates presigned upload URLs for direct browser → Supabase Storage uploads.
 * Also creates footage_items records so every upload is tracked in the Footage Hub.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createFootageItem, isAutoEditEligible } from '@/lib/footage/service';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const BUCKET = 'renders';
const MAX_FILE_BYTES = 500 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const userId = authCtx.user.id;

  let body: {
    files: Array<{ filename: string; content_type: string; size_bytes: number }>;
    job_id?: string;
    content_item_id?: string;
    source_type?: string;
  };

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.files?.length || body.files.length > 6) {
    return createApiErrorResponse('BAD_REQUEST', 'files must be 1-6 items', 400, correlationId);
  }

  for (const f of body.files) {
    if (f.size_bytes > MAX_FILE_BYTES) {
      return createApiErrorResponse('BAD_REQUEST', `File ${f.filename} exceeds 500MB limit`, 400, correlationId);
    }
  }

  const jobId = body.job_id || `job-${Date.now().toString(36)}`;
  const eligible = await isAutoEditEligible(userId);

  const uploads = await Promise.all(
    body.files.map(async (f, i) => {
      const ext = f.filename.split('.').pop() || 'mp4';
      const storagePath = `creator-clips/${userId}/${jobId}/${i}-${Date.now()}.${ext}`;

      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);

      if (error || !data) {
        return { error: error?.message || 'Failed to create upload URL', path: storagePath };
      }

      const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

      // Create footage_item record immediately — stage: raw_uploaded
      // The item is registered in the hub as soon as we issue the URL
      let footageItemId: string | null = null;
      try {
        const footageItem = await createFootageItem({
          workspace_id:     userId,
          created_by:       userId,
          original_filename: f.filename,
          storage_path:     storagePath,
          storage_url:      storageUrl,
          byte_size:        f.size_bytes,
          mime_type:        f.content_type || 'video/mp4',
          source_type:      (body.source_type as any) || 'clip_studio',
          source_ref_id:    jobId,
          uploaded_by:      authCtx.isAdmin ? 'admin' : 'user',
          content_item_id:  body.content_item_id,
          auto_edit_eligible: eligible,
          metadata:         { job_id: jobId, index: i },
        });
        footageItemId = footageItem.id;
      } catch {
        // Non-fatal — upload URLs still work even if footage record creation fails
      }

      return {
        signed_url:      data.signedUrl,
        token:           data.token,
        path:            storagePath,
        storage_url:     storageUrl,
        filename:        f.filename,
        index:           i,
        footage_item_id: footageItemId,
      };
    })
  );

  const failed = uploads.filter(u => 'error' in u && !('footage_item_id' in u));
  if (failed.length > 0) {
    return createApiErrorResponse('STORAGE_ERROR', 'Failed to create some upload URLs', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: { job_id: jobId, uploads },
    correlation_id: correlationId,
  });
}

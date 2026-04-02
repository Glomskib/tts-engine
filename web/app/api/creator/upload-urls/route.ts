/**
 * POST /api/creator/upload-urls
 *
 * Generates presigned upload URLs for direct browser → Supabase Storage uploads.
 * Used by Clip Studio to upload raw clips before queuing a render job.
 *
 * Returns one signed URL per requested file.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const BUCKET = 'renders';
const URL_EXPIRY_SECONDS = 600; // 10 minutes

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
  };

  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.files?.length || body.files.length > 6) {
    return createApiErrorResponse('BAD_REQUEST', 'files must be 1-6 items', 400, correlationId);
  }

  const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB per clip
  for (const f of body.files) {
    if (f.size_bytes > MAX_FILE_BYTES) {
      return createApiErrorResponse('BAD_REQUEST', `File ${f.filename} exceeds 500MB limit`, 400, correlationId);
    }
  }

  const jobId = body.job_id || `job-${Date.now().toString(36)}`;

  // Generate signed upload URL for each file
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

      return {
        signed_url: data.signedUrl,
        token: data.token,
        path: storagePath,
        storage_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`,
        filename: f.filename,
        index: i,
      };
    })
  );

  const failed = uploads.filter(u => 'error' in u);
  if (failed.length > 0) {
    return createApiErrorResponse('STORAGE_ERROR', 'Failed to create some upload URLs', 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: {
      job_id: jobId,
      uploads,
    },
    correlation_id: correlationId,
  });
}

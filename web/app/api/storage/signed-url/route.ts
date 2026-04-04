/**
 * POST /api/storage/signed-url
 *
 * Generate a signed URL for a storage object.
 * Used by the UI to get playback/download URLs for media files.
 *
 * Body: { bucket: string, path: string, expiry?: number }
 * Returns: { ok: true, url: string, expires_in: number }
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { getSignedMediaUrl, getPublicMediaUrl, BUCKETS, type BucketName } from '@/lib/media-storage';

export const runtime = 'nodejs';

/** Buckets users are allowed to request signed URLs for */
const ALLOWED_BUCKETS = new Set<string>([
  BUCKETS.RAW_VIDEOS,
  BUCKETS.RENDERS,
  BUCKETS.BROLL_GENERATED,
  BUCKETS.BROLL_STOCK,
  BUCKETS.RAW_FOOTAGE,
]);

const MAX_EXPIRY = 7200; // 2 hours max
const DEFAULT_EXPIRY = 3600; // 1 hour

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);

  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { bucket, path, expiry } = body as { bucket?: string; path?: string; expiry?: number };

  if (!bucket || !path) {
    return createApiErrorResponse('BAD_REQUEST', 'bucket and path are required', 400, correlationId);
  }

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return createApiErrorResponse('BAD_REQUEST', `Bucket "${bucket}" is not allowed`, 400, correlationId);
  }

  // Tenant safety: for video-files and renders, verify path belongs to user's workspace
  if (bucket === BUCKETS.RAW_VIDEOS && !path.startsWith(`${user.id}/`)) {
    return createApiErrorResponse('FORBIDDEN', 'Access denied to this storage path', 403, correlationId);
  }
  if (bucket === BUCKETS.RENDERS && path.startsWith('editing/') && !path.startsWith(`editing/${user.id}/`)) {
    return createApiErrorResponse('FORBIDDEN', 'Access denied to this storage path', 403, correlationId);
  }

  const expirySeconds = Math.min(expiry || DEFAULT_EXPIRY, MAX_EXPIRY);

  // For public buckets, return public URL directly (no expiry needed)
  // For private buckets, generate signed URL
  const signedUrl = await getSignedMediaUrl(bucket as BucketName, path, expirySeconds);

  if (!signedUrl) {
    // Fallback to public URL for public buckets
    try {
      const publicUrl = getPublicMediaUrl(bucket as BucketName, path);
      return NextResponse.json({
        ok: true,
        url: publicUrl,
        expires_in: null,
        correlation_id: correlationId,
      });
    } catch {
      return createApiErrorResponse('NOT_FOUND', 'Storage object not found or signing failed', 404, correlationId);
    }
  }

  return NextResponse.json({
    ok: true,
    url: signedUrl,
    expires_in: expirySeconds,
    correlation_id: correlationId,
  });
}, { routeName: '/api/storage/signed-url', feature: 'media-storage' });

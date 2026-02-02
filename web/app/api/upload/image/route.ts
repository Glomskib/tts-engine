// Image upload API for B-Roll image-to-image generation
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  try {
    // Authenticate
    const authContext = await getApiAuthContext();
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    // Parse form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid form data', 400, correlationId);
    }

    const file = formData.get('file') as File | null;

    if (!file) {
      return createApiErrorResponse('VALIDATION_ERROR', 'No file provided', 400, correlationId);
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        400,
        correlationId
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        400,
        correlationId
      );
    }

    // Generate unique filename
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    const fileName = `${authContext.user.id}/${timestamp}-${randomStr}.${ext}`;

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from('b-roll-uploads')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('[Upload] Supabase storage error:', error);

      // Check if bucket doesn't exist
      if (error.message?.includes('Bucket not found') || error.message?.includes('bucket')) {
        return createApiErrorResponse(
          'CONFIG_ERROR',
          'Storage bucket not configured. Please run the storage migration.',
          500,
          correlationId
        );
      }

      return createApiErrorResponse('STORAGE_ERROR', 'Upload failed', 500, correlationId);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('b-roll-uploads')
      .getPublicUrl(data.path);

    console.log(`[Upload] Successfully uploaded image for user ${authContext.user.id}: ${data.path}`);

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      path: data.path,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error('[Upload] Unexpected error:', error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

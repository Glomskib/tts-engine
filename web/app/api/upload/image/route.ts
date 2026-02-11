import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const BUCKET_NAME = 'product-images';

/**
 * Sanitize filename for safe storage paths
 */
function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[^a-zA-Z0-9_-]/g, '_') // only safe chars
    .substring(0, 80); // limit length
}

/**
 * Ensure the storage bucket exists
 */
async function ensureBucket(): Promise<true | string> {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

  if (listError) {
    return `Failed to list buckets: ${listError.message}`;
  }

  const exists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (exists) return true;

  // Create bucket if it doesn't exist
  const { error: createError } = await supabaseAdmin.storage.createBucket(
    BUCKET_NAME,
    {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ALLOWED_TYPES,
    }
  );

  if (createError) {
    return `Failed to create bucket: ${createError.message}`;
  }

  return true;
}

/**
 * POST /api/upload/image
 * Upload a product image to Supabase Storage
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - supports SESSION, API KEY (ff_ak_*), or SERVICE_API_KEY
  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return createApiErrorResponse("BAD_REQUEST", "No file provided", 400, correlationId);
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        400,
        correlationId
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        400,
        correlationId
      );
    }

    // Ensure bucket exists
    const bucketCheck = await ensureBucket();
    if (bucketCheck !== true) {
      console.error(`[${correlationId}] Bucket error:`, bucketCheck);
      return createApiErrorResponse("INTERNAL", bucketCheck, 500, correlationId);
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const sanitized = sanitizeFilename(file.name);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${sanitized}-${timestamp}-${random}.${ext}`;
    const filePath = `${auth.userId}/${filename}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[${correlationId}] Upload error:`, uploadError);
      return createApiErrorResponse(
        "INTERNAL",
        `Upload failed: ${uploadError.message}`,
        500,
        correlationId
      );
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return NextResponse.json({
      ok: true,
      data: {
        url: urlData.publicUrl,
        path: filePath,
        size: file.size,
        type: file.type,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Image upload error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : 'Upload failed',
      500,
      correlationId
    );
  }
}

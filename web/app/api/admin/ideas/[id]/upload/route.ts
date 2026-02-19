/**
 * POST /api/admin/ideas/:id/upload
 *
 * Upload a file (PDF, image, text) to an idea as a file artifact.
 * Stores in Supabase Storage bucket "cc-idea-artifacts", creates idea_artifact row.
 * Owner-only access (returns 404 for non-owners).
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { saveIdeaArtifact } from '@/lib/command-center/ingest';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

const BUCKET_NAME = 'cc-idea-artifacts';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'text/plain': ['txt', 'md', 'csv', 'log'],
  'text/markdown': ['md'],
  'text/csv': ['csv'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
};

const ALLOWED_EXTENSIONS = new Set(
  Object.values(ALLOWED_TYPES).flat()
);

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 80);
}

async function ensureBucket(): Promise<true | string> {
  const { data: buckets, error: listError } =
    await supabaseAdmin.storage.listBuckets();

  if (listError) {
    return `Failed to list buckets: ${listError.message}`;
  }

  const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);
  if (exists) return true;

  const { error: createError } = await supabaseAdmin.storage.createBucket(
    BUCKET_NAME,
    {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
    }
  );

  if (createError) {
    if (
      createError.message?.includes('already exists') ||
      createError.message?.includes('duplicate')
    ) {
      return true;
    }
    return `Failed to create bucket: ${createError.message}`;
  }

  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id: ideaId } = await params;

  // Owner-only guard
  const denied = await requireOwner(request);
  if (denied) return denied;

  try {
    // Verify idea exists
    const { data: idea, error: ideaError } = await supabaseAdmin
      .from('ideas')
      .select('id, title')
      .eq('id', ideaId)
      .single();

    if (ideaError || !idea) {
      return createApiErrorResponse('NOT_FOUND', 'Idea not found', 404, correlationId);
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
      return createApiErrorResponse('VALIDATION_ERROR', 'No file provided', 400, correlationId);
    }

    // Validate type
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isAllowedMime = file.type in ALLOWED_TYPES;
    const isAllowedExt = ALLOWED_EXTENSIONS.has(extension);

    if (!isAllowedMime && !isAllowedExt) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        `Unsupported file type. Allowed: PDF, images (jpg/png/webp/gif), text files (txt/md/csv). Got MIME="${file.type}", ext=".${extension}"`,
        400,
        correlationId
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = Math.round(file.size / 1024 / 1024);
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        `File too large (${sizeMB} MB). Max 25 MB.`,
        400,
        correlationId
      );
    }

    // Ensure bucket
    const bucketResult = await ensureBucket();
    if (bucketResult !== true) {
      console.error(`[${correlationId}] Bucket error:`, bucketResult);
      return createApiErrorResponse('STORAGE_ERROR', bucketResult, 500, correlationId);
    }

    // Upload to storage
    const sanitized = sanitizeFilename(file.name);
    const storagePath = `${ideaId}/${Date.now()}_${sanitized}.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } =
      await supabaseAdmin.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error(`[${correlationId}] Upload error:`, uploadError);
      return createApiErrorResponse(
        'STORAGE_ERROR',
        `Upload failed: ${uploadError.message}`,
        500,
        correlationId
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path);

    // For text files, extract text immediately (small enough to do inline)
    let extractedText: string | undefined;
    if (file.type.startsWith('text/') || ['txt', 'md', 'csv', 'log'].includes(extension)) {
      try {
        extractedText = new TextDecoder().decode(buffer);
        // Limit to 100K chars to avoid bloating the DB
        if (extractedText.length > 100_000) {
          extractedText = extractedText.substring(0, 100_000) + '\n\n[truncated at 100K chars]';
        }
      } catch {
        // Will be handled by nightly job
      }
    }

    // Create artifact record
    const artifact = await saveIdeaArtifact({
      idea_id: ideaId,
      artifact_type: 'file',
      content_md: `Uploaded file: [${file.name}](${publicUrl})`,
      label: file.name,
      storage_path: uploadData.path,
      content_type: file.type || 'application/octet-stream',
      extracted_text: extractedText,
      meta: {
        file_size: file.size,
        public_url: publicUrl,
        uploaded_at: new Date().toISOString(),
      },
    });

    if (!artifact) {
      return createApiErrorResponse('DB_ERROR', 'Failed to save artifact record', 500, correlationId);
    }

    const response = NextResponse.json(
      {
        ok: true,
        correlation_id: correlationId,
        data: {
          artifact_id: artifact.id,
          label: file.name,
          storage_path: uploadData.path,
          public_url: publicUrl,
          content_type: file.type,
          file_size: file.size,
          extracted_text_available: !!extractedText,
        },
      },
      { status: 201 }
    );
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Unexpected error in idea upload:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

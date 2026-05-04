/**
 * POST /api/videos/upload/sign
 *
 * Returns a Supabase Storage signed-upload URL so the client can PUT the file
 * directly to storage, bypassing Vercel's 4.5 MB function-payload limit.
 *
 * This fixes the 413 "Payload too large" error on the AI Video Editor uploader
 * for videos over 4.5 MB.
 *
 * Body (JSON):
 *   { filename: string, content_type: string, size_bytes: number, type?: 'raw'|'edited' }
 *
 * Returns:
 *   { ok: true, signed_url, token, storage_path, expires_in }
 *   or 4xx with { ok: false, error }
 *
 * After client PUT succeeds, call /api/videos/upload/finalize with the
 * storage_path + metadata to create the videos table record.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

const BUCKET_NAME = 'video-files';
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
]);
const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi']);

const SIGNED_URL_EXPIRES = 60 * 30; // 30 minutes — enough for slow uploads

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 80);
}

async function ensureBucket(): Promise<true | string> {
  const { data: buckets, error: listError } =
    await supabaseAdmin.storage.listBuckets();
  if (listError) return `Failed to list buckets: ${listError.message}`;

  const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);
  if (exists) return true;

  const { error: createError } = await supabaseAdmin.storage.createBucket(
    BUCKET_NAME,
    {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: Array.from(ALLOWED_VIDEO_TYPES),
    },
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

interface SignBody {
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  type?: string;
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: SignBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 },
    );
  }

  const filename = (body.filename ?? '').trim();
  const contentType = (body.content_type ?? '').trim();
  const sizeBytes = Number(body.size_bytes);
  const typeRaw = (body.type ?? 'raw').trim().toLowerCase();
  const uploadType = typeRaw === 'edited' ? 'edited' : 'raw';

  if (!filename) {
    return NextResponse.json(
      { ok: false, error: 'filename is required' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json(
      { ok: false, error: 'size_bytes must be a positive number' },
      { status: 400 },
    );
  }
  if (sizeBytes > MAX_FILE_SIZE) {
    const sizeMB = Math.round(sizeBytes / 1024 / 1024);
    return NextResponse.json(
      { ok: false, error: `File too large (${sizeMB} MB). Max 500 MB.` },
      { status: 400 },
    );
  }

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const isAllowedMime = ALLOWED_VIDEO_TYPES.has(contentType);
  const isAllowedExt = ALLOWED_EXTENSIONS.has(extension);
  if (!isAllowedMime && !isAllowedExt) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported file type. Allowed: mp4, mov, webm, avi.`,
      },
      { status: 400 },
    );
  }

  const bucketResult = await ensureBucket();
  if (bucketResult !== true) {
    return NextResponse.json(
      { ok: false, error: bucketResult },
      { status: 500 },
    );
  }

  const sanitized = sanitizeFilename(filename);
  const ext = isAllowedExt ? extension : 'mp4';
  const storagePath = `${auth.user.id}/${uploadType}/${Date.now()}_${sanitized}.${ext}`;

  const { data: signedData, error: signError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(storagePath);

  if (signError || !signedData) {
    return NextResponse.json(
      {
        ok: false,
        error: `Failed to generate signed URL: ${signError?.message ?? 'unknown'}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    signed_url: signedData.signedUrl,
    token: signedData.token,
    storage_path: storagePath,
    bucket: BUCKET_NAME,
    expires_in: SIGNED_URL_EXPIRES,
  });
}

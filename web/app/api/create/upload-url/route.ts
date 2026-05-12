/**
 * POST /api/create/upload-url
 *
 * Mint a signed URL the browser can PUT directly to Supabase Storage,
 * bypassing the 50MB API route body cap that broke uploads before.
 *
 * Body: { filename, mime, size }
 * Returns: { ok, signed_url, public_url, storage_path }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-file upload cap. Supabase free tier is 50MB; Pro is up to 50GB.
// We cap at 500MB by default — most short-form source videos fit. Override via
// FF_CLIP_UPLOAD_MAX_BYTES env var if the project's Supabase plan supports more.
const MAX_BYTES = Number(process.env.FF_CLIP_UPLOAD_MAX_BYTES) || 500 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  'video/x-msvideo', 'video/mpeg', 'video/3gpp', 'application/octet-stream',
]);

const BUCKET = 'clip-sources';

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { filename?: string; mime?: string; size?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const filename = (body.filename || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const mime = body.mime || 'application/octet-stream';
  const size = Number(body.size || 0);

  if (size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `File too large — max 5GB, got ${(size / 1024 / 1024).toFixed(0)}MB` }, { status: 413 });
  }
  if (mime && !ALLOWED_MIMES.has(mime) && !mime.startsWith('video/')) {
    return NextResponse.json({ ok: false, error: `Unsupported file type: ${mime}` }, { status: 415 });
  }

  // Ensure bucket exists (idempotent)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_MIMES),
    }).catch(() => {});
  }

  // Storage path: clip-sources/<user_id>/<timestamp>-<filename>
  const ts = Date.now();
  const storagePath = `${auth.user.id}/${ts}-${filename}`;

  // Create a signed upload URL valid for 1 hour
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || 'Could not mint signed URL' }, { status: 500 });
  }

  // Public URL (will only resolve if bucket made public OR we mint a signed read URL on demand)
  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  // Signed read URL valid 7 days — we'll use this as the "source_url" for the job
  const { data: signedRead } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  return NextResponse.json({
    ok: true,
    signed_url: data.signedUrl,         // PUT here from the browser
    storage_path: storagePath,
    public_url: signedRead?.signedUrl || pub?.publicUrl, // GET this in the job
    bucket: BUCKET,
  });
}

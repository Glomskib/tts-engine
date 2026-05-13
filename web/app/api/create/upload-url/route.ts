/**
 * POST /api/create/upload-url
 *
 * Mint a signed URL the browser can PUT directly to storage. Prefers
 * Cloudflare R2 (no per-file size cap, free egress) when configured;
 * falls back to Supabase Storage for dev/local.
 *
 * Body: { filename, mime, size }
 * Returns: { ok, signed_url, public_url, storage_path, backend }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isR2Configured, presignR2Url, buildR2Key } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-file upload cap. R2 has no real limit; Supabase tiers cap below 5GB.
// 2GB default is generous for short-form video; override with FF_CLIP_UPLOAD_MAX_BYTES.
const MAX_BYTES = Number(process.env.FF_CLIP_UPLOAD_MAX_BYTES) || 2 * 1024 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  'video/x-msvideo', 'video/mpeg', 'video/3gpp', 'application/octet-stream',
]);

// Supabase fallback bucket — used only when R2 isn't configured (dev)
const SUPA_BUCKET = 'clip-sources';

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { filename?: string; mime?: string; size?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const filename = (body.filename || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const mime = body.mime || 'application/octet-stream';
  const size = Number(body.size || 0);

  if (size > MAX_BYTES) {
    return NextResponse.json({
      ok: false,
      error: `File too large — max ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB, got ${(size / 1024 / 1024).toFixed(0)}MB`,
    }, { status: 413 });
  }
  if (mime && !ALLOWED_MIMES.has(mime) && !mime.startsWith('video/')) {
    return NextResponse.json({ ok: false, error: `Unsupported file type: ${mime}` }, { status: 415 });
  }

  // ── R2 BACKEND (preferred) ─────────────────────────────────────────
  if (isR2Configured()) {
    try {
      const key = buildR2Key(auth.user.id, filename);
      // Upload URL valid for 1 hour
      const uploadUrl = presignR2Url({ method: 'PUT', key, expiresInSec: 3600, contentType: mime });
      // Read URL valid for 7 days — the pipeline downloads via this URL
      const readUrl = presignR2Url({ method: 'GET', key, expiresInSec: 7 * 24 * 3600 });
      return NextResponse.json({
        ok: true,
        signed_url: uploadUrl,
        storage_path: key,
        public_url: readUrl,
        bucket: process.env.R2_BUCKET || 'flashflow-output',
        backend: 'r2',
      });
    } catch (e) {
      console.warn('[upload-url] R2 mint failed, falling back to Supabase:', e instanceof Error ? e.message : e);
    }
  }

  // ── SUPABASE FALLBACK ──────────────────────────────────────────────
  // Ensure bucket exists (idempotent)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === SUPA_BUCKET)) {
    await supabaseAdmin.storage.createBucket(SUPA_BUCKET, {
      public: false,
      allowedMimeTypes: Array.from(ALLOWED_MIMES),
    }).catch(() => {});
  }

  const ts = Date.now();
  const storagePath = `${auth.user.id}/${ts}-${filename}`;

  const { data, error } = await supabaseAdmin.storage
    .from(SUPA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || 'Could not mint signed URL' }, { status: 500 });
  }

  const { data: pub } = supabaseAdmin.storage.from(SUPA_BUCKET).getPublicUrl(storagePath);
  const { data: signedRead } = await supabaseAdmin.storage
    .from(SUPA_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  return NextResponse.json({
    ok: true,
    signed_url: data.signedUrl,
    storage_path: storagePath,
    public_url: signedRead?.signedUrl || pub?.publicUrl,
    bucket: SUPA_BUCKET,
    backend: 'supabase',
  });
}

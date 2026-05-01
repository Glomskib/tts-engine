/**
 * POST /api/editor/jobs/[id]/upload/sign
 *
 * Returns a Supabase Storage signed-upload URL so the client can PUT the file
 * directly to storage, bypassing Vercel's 4.5 MB function-payload limit.
 *
 * Body: { kind: 'raw'|'broll'|'product'|'music', name: string, size: number, type?: string }
 * Returns: { ok: true, signedUrl, token, storagePath, expiresIn } or 4xx with error.
 *
 * Pairs with /upload/finalize which records the asset on the job after the PUT succeeds.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { BUCKET_NAME, ensureEditJobsBucket, type AssetKind } from '@/lib/editor/pipeline';
import { VALID_KINDS, validateEditorAsset, sanitizeAssetName } from '@/lib/editor/validation';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('ai_edit_jobs')
    .select('id,user_id,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  let body: { kind?: string; name?: string; size?: number; type?: string } = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Bad JSON.' }, { status: 400 }); }

  const kindRaw = String(body.kind ?? 'raw');
  if (!VALID_KINDS.has(kindRaw as AssetKind)) {
    return NextResponse.json({ ok: false, error: `Invalid asset kind "${kindRaw}".` }, { status: 400 });
  }
  const kind = kindRaw as AssetKind;

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid file size.' }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ ok: false, error: 'Missing file name.' }, { status: 400 });
  }

  // Server-side validation BEFORE issuing the signed URL — fail fast on size/mime.
  const validationError = validateEditorAsset(kind, {
    size,
    type: body.type ?? '',
    name: body.name,
  });
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  await ensureEditJobsBucket();

  const safeName = sanitizeAssetName(body.name);
  const storagePath = `${auth.user.id}/${id}/${kind}/${Date.now()}_${safeName}`;

  const { data: signed, error: signErr } = await supabaseAdmin
    .storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(storagePath);

  if (signErr || !signed) {
    return NextResponse.json({ ok: false, error: signErr?.message ?? 'Could not create signed upload URL.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    signedUrl: signed.signedUrl,
    token: signed.token,
    storagePath,
    expiresIn: 3600,
  });
}

/**
 * POST /api/editor/jobs/[id]/upload — upload a file to an edit job.
 * multipart/form-data: file=<blob>, kind=raw|broll|product|music
 *
 * Server-side validation (size + mime) runs BEFORE anything touches storage
 * so the client gets fast, specific errors. Limits are mirrored on the
 * client in app/admin/editor/new/page.tsx.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { BUCKET_NAME, ensureEditJobsBucket, type EditJobAsset, type AssetKind } from '@/lib/editor/pipeline';
import { VALID_KINDS, validateEditorAsset, sanitizeAssetName } from '@/lib/editor/validation';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('ai_edit_jobs')
    .select('id,user_id,assets,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  await ensureEditJobsBucket();

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ ok: false, error: 'Could not parse upload form.' }, { status: 400 }); }

  const file = form.get('file');
  const kindRaw = String(form.get('kind') ?? 'raw');
  if (!VALID_KINDS.has(kindRaw as AssetKind)) {
    return NextResponse.json({ ok: false, error: `Invalid asset kind "${kindRaw}".` }, { status: 400 });
  }
  const kind = kindRaw as AssetKind;

  if (!file || typeof file === 'string') {
    return NextResponse.json({ ok: false, error: 'No file was attached to the upload.' }, { status: 400 });
  }
  const blob = file as unknown as Blob & { name?: string; type?: string };

  const validationError = validateEditorAsset(kind, { size: blob.size, type: blob.type, name: blob.name });
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }
  const mime = (blob.type || '').toLowerCase();

  const name = sanitizeAssetName(blob.name ?? `file_${Date.now()}`);
  const storagePath = `${auth.user.id}/${id}/${kind}/${Date.now()}_${name}`;
  const buf = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await supabaseAdmin
    .storage
    .from(BUCKET_NAME)
    .upload(storagePath, buf, {
      contentType: mime || 'application/octet-stream',
      upsert: false,
    });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const existing: EditJobAsset[] = Array.isArray(job.assets) ? job.assets : [];
  const updated: EditJobAsset[] = [...existing, { kind, path: storagePath, name }];

  await supabaseAdmin
    .from('ai_edit_jobs')
    .update({ assets: updated, status: job.status === 'draft' ? 'uploading' : job.status })
    .eq('id', id);

  return NextResponse.json({ ok: true, asset: { kind, path: storagePath, name } });
}

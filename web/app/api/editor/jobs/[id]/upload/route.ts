/**
 * POST /api/editor/jobs/[id]/upload — upload a file to an edit job.
 * multipart/form-data: file=<blob>, kind=raw|broll|product|music
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { BUCKET_NAME, ensureEditJobsBucket, type EditJobAsset, type AssetKind } from '@/lib/editor/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_SIZE = 500 * 1024 * 1024;
const VALID_KINDS = new Set<AssetKind>(['raw', 'broll', 'product', 'music']);

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  // Verify ownership
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id,assets,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await ensureEditJobsBucket();

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'INVALID_FORM' }, { status: 400 }); }

  const file = form.get('file');
  const kindRaw = String(form.get('kind') ?? 'raw');
  if (!VALID_KINDS.has(kindRaw as AssetKind)) {
    return NextResponse.json({ error: 'INVALID_KIND' }, { status: 400 });
  }
  const kind = kindRaw as AssetKind;

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });
  }
  const blob = file as unknown as Blob & { name?: string };
  if (blob.size > MAX_SIZE) {
    return NextResponse.json({ error: 'TOO_LARGE', max: MAX_SIZE }, { status: 413 });
  }

  const name = sanitize((blob as unknown as { name?: string }).name ?? `file_${Date.now()}`);
  const storagePath = `${auth.user.id}/${id}/${kind}/${Date.now()}_${name}`;
  const buf = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await supabaseAdmin
    .storage
    .from(BUCKET_NAME)
    .upload(storagePath, buf, {
      contentType: (blob as unknown as { type?: string }).type || 'application/octet-stream',
      upsert: false,
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const existing: EditJobAsset[] = Array.isArray(job.assets) ? job.assets : [];
  const updated: EditJobAsset[] = [...existing, { kind, path: storagePath, name }];

  await supabaseAdmin
    .from('edit_jobs')
    .update({ assets: updated, status: job.status === 'draft' ? 'uploading' : job.status })
    .eq('id', id);

  return NextResponse.json({ ok: true, asset: { kind, path: storagePath, name } });
}

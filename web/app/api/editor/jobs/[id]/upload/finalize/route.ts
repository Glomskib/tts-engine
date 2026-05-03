/**
 * POST /api/editor/jobs/[id]/upload/finalize
 *
 * Called by the client AFTER it successfully PUTs the file directly to the
 * signed-upload URL returned by /sign. Verifies the file landed in storage,
 * then registers the asset on the job.
 *
 * Body: { storagePath: string, kind: 'raw'|'broll'|'product'|'music', name: string }
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { BUCKET_NAME, type EditJobAsset, type AssetKind } from '@/lib/editor/pipeline';
import { VALID_KINDS, sanitizeAssetName } from '@/lib/editor/validation';

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
    .select('id,user_id,assets,status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();
  if (jobErr || !job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  let body: { storagePath?: string; kind?: string; name?: string } = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Bad JSON.' }, { status: 400 }); }

  const storagePath = String(body.storagePath ?? '');
  const kindRaw = String(body.kind ?? '');
  const name = sanitizeAssetName(String(body.name ?? ''));
  if (!storagePath || !VALID_KINDS.has(kindRaw as AssetKind) || !name) {
    return NextResponse.json({ ok: false, error: 'Missing storagePath, kind, or name.' }, { status: 400 });
  }
  const kind = kindRaw as AssetKind;

  // Path must belong to this user + job to prevent path-injection
  const expectedPrefix = `${auth.user.id}/${id}/${kind}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ ok: false, error: 'Storage path does not match user/job/kind.' }, { status: 403 });
  }

  // Verify the file actually exists in storage. createSignedUrl returns a URL
  // even when the underlying object is missing, so it's NOT a real existence
  // check — list the parent dir instead and look for the exact basename.
  const lastSlash = storagePath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : '';
  const base = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;
  const { data: listing, error: listErr } = await supabaseAdmin
    .storage
    .from(BUCKET_NAME)
    .list(dir, { limit: 1000, search: base });
  if (listErr) {
    return NextResponse.json({ ok: false, error: `Storage check failed: ${listErr.message}` }, { status: 500 });
  }
  const found = (listing || []).some((entry: { name: string }) => entry.name === base);
  if (!found) {
    return NextResponse.json({ ok: false, error: 'File not found in storage. Did the upload finish?' }, { status: 404 });
  }

  // Register the asset
  const existing: EditJobAsset[] = Array.isArray(job.assets) ? job.assets : [];
  const updated: EditJobAsset[] = [...existing, { kind, path: storagePath, name }];

  const nextStatus = job.status === 'draft' ? 'uploading' : job.status;
  const { error: updateErr } = await supabaseAdmin
    .from('ai_edit_jobs')
    .update({ assets: updated, status: nextStatus })
    .eq('id', id);
  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, asset: { kind, path: storagePath, name } });
}

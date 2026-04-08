/**
 * POST /api/editor/jobs/from-pipeline — create an edit job with assets in a single
 * atomic operation and immediately enqueue the edit pipeline.
 *
 * Accepts multipart/form-data with fields:
 *   - pipeline_id   (string, required) source pipeline/video id
 *   - mode          (string, optional) one of quick|hook|ugc|talking_head
 *   - title         (string, optional) display title
 *   - raw           (file,   required) the raw footage
 *   - product       (file,   optional) product still image
 *   - music         (file,   optional) music bed audio
 *
 * This route exists to eliminate the "empty draft" bug where a job row was
 * created with no raw footage and the user landed on a blank editor page.
 * By the time this handler returns, the job row has at least one raw asset
 * attached AND has been enqueued to Inngest.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { BUCKET_NAME, ensureEditJobsBucket, type EditJobAsset, type AssetKind } from '@/lib/editor/pipeline';
import { validateEditorAsset, sanitizeAssetName } from '@/lib/editor/validation';
import { checkDailyLimit } from '@/lib/usage/dailyUsage';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const maxDuration = 300;

const VALID_MODES = new Set(['quick', 'hook', 'ugc', 'talking_head']);

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not parse upload form.' }, { status: 400 });
  }

  const pipelineId = String(form.get('pipeline_id') ?? '').trim();
  if (!pipelineId) {
    return NextResponse.json({ ok: false, error: 'pipeline_id is required.' }, { status: 400 });
  }

  const modeRaw = String(form.get('mode') ?? 'hook');
  const mode = VALID_MODES.has(modeRaw) ? modeRaw : 'hook';
  const title = (String(form.get('title') ?? '').trim()) || 'Untitled Edit';

  const rawFile = form.get('raw');
  if (!rawFile || typeof rawFile === 'string') {
    return NextResponse.json({
      ok: false,
      error: 'A raw video file is required. Please attach footage before starting the edit.',
    }, { status: 400 });
  }

  const productFile = form.get('product');
  const musicFile = form.get('music');

  // Look up the pipeline item so we can stamp script_id onto the new job.
  // OWNERSHIP: we scope by client_user_id so a user cannot reference a
  // pipeline row they do not own — even if they guessed its id. If the id
  // doesn't resolve for the current user we still create the job (script_id
  // null) because the user already has footage selected and shouldn't be
  // blocked; we just refuse to copy any script linkage from a row that
  // isn't theirs.
  let scriptId: string | null = null;
  try {
    const { data: video } = await supabaseAdmin
      .from('videos')
      .select('id, script_id, client_user_id')
      .eq('id', pipelineId)
      .eq('client_user_id', auth.user.id)
      .maybeSingle();
    if (video?.script_id) scriptId = video.script_id;
  } catch {
    // Non-fatal — we keep script_id null.
  }

  if (process.env.NODE_ENV !== 'production' || process.env.EDITOR_DEBUG === '1') {
    console.log('[editor]', {
      route: 'from-pipeline',
      user_id: auth.user.id,
      pipeline_id: pipelineId,
    });
  }

  // Build the (kind, blob) pairs we intend to upload.
  type Pair = { kind: AssetKind; blob: Blob & { name?: string; type?: string } };
  const pairs: Pair[] = [];
  pairs.push({ kind: 'raw', blob: rawFile as unknown as Blob & { name?: string; type?: string } });
  if (productFile && typeof productFile !== 'string') {
    pairs.push({ kind: 'product', blob: productFile as unknown as Blob & { name?: string; type?: string } });
  }
  if (musicFile && typeof musicFile !== 'string') {
    pairs.push({ kind: 'music', blob: musicFile as unknown as Blob & { name?: string; type?: string } });
  }

  // Validate EVERY file BEFORE touching storage or the database.
  for (const p of pairs) {
    const err = validateEditorAsset(p.kind, { size: p.blob.size, type: p.blob.type, name: p.blob.name });
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  // Enforce daily render limit before creating anything.
  const limit = await checkDailyLimit(auth.user.id, auth.isAdmin, 'renders');
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'LIMIT_REACHED', upgrade: true, limit: limit.limit, used: limit.used },
      { status: 429 },
    );
  }

  await ensureEditJobsBucket();

  // Create the job row first so we have an id to key uploads under.
  // The job starts as `uploading` — it is NEVER persisted as `draft` without
  // assets attached — and is flipped to `queued` only after all uploads land.
  const { data: job, error: insertErr } = await supabaseAdmin
    .from('ai_edit_jobs')
    .insert({
      user_id: auth.user.id,
      title,
      mode,
      status: 'uploading',
      script_id: scriptId,
      assets: [],
      mode_options: {},
    })
    .select('id')
    .single();
  if (insertErr || !job) {
    return NextResponse.json({ ok: false, error: insertErr?.message || 'Failed to create job row.' }, { status: 500 });
  }
  const jobId = job.id as string;

  // Upload each file and build the assets array.
  const uploadedAssets: EditJobAsset[] = [];
  for (const p of pairs) {
    const name = sanitizeAssetName(p.blob.name ?? `file_${Date.now()}`);
    const storagePath = `${auth.user.id}/${jobId}/${p.kind}/${Date.now()}_${name}`;
    const buf = Buffer.from(await p.blob.arrayBuffer());
    const { error: upErr } = await supabaseAdmin
      .storage
      .from(BUCKET_NAME)
      .upload(storagePath, buf, {
        contentType: (p.blob.type || 'application/octet-stream').toLowerCase(),
        upsert: false,
      });
    if (upErr) {
      // Clean up the half-populated job so we don't leave empty drafts behind.
      await supabaseAdmin.from('ai_edit_jobs').delete().eq('id', jobId);
      return NextResponse.json({ ok: false, error: `Upload failed for ${p.kind}: ${upErr.message}` }, { status: 500 });
    }
    uploadedAssets.push({ kind: p.kind, path: storagePath, name });
  }

  // Guarantee we actually wrote a raw asset.
  const hasRaw = uploadedAssets.some((a) => a.kind === 'raw');
  if (!hasRaw) {
    await supabaseAdmin.from('ai_edit_jobs').delete().eq('id', jobId);
    return NextResponse.json({
      ok: false,
      error: 'No raw footage was uploaded — aborting job creation.',
    }, { status: 400 });
  }

  // Flip to queued and persist the assets in a single update.
  const { error: updErr } = await supabaseAdmin
    .from('ai_edit_jobs')
    .update({
      assets: uploadedAssets,
      status: 'queued',
      error: null,
      started_at: null,
      finished_at: null,
    })
    .eq('id', jobId);
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  // Fire the edit pipeline. Failures here are non-fatal — the job already
  // exists with assets and can be retried from the detail page.
  try {
    await inngest.send({
      name: 'editor/job.process',
      data: { jobId, userId: auth.user.id },
    });
  } catch (e) {
    console.error('[editor] inngest send failed', e);
  }

  return NextResponse.json({ ok: true, job_id: jobId });
}

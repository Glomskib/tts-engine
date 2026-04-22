/**
 * POST /api/edit-builder/projects/[id]/clips — upload a source clip.
 *
 * Accepts multipart/form-data with a `file` field (video/mp4, video/quicktime,
 * video/webm). Stores in Supabase Storage under
 * `<user_id>/<project_id>/source/<timestamp>_<filename>` in the `edit-jobs`
 * bucket (same bucket as the legacy pipeline — storage is shared, tables are
 * not). Creates an `edit_source_clips` row.
 *
 * Duration detection is left null for now — the worker's ffmpeg will handle
 * the actual file. If we want duration at upload time we'd need to shell out
 * to ffprobe here, which isn't worth the complexity for the first usable flow.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { ensureEditJobsBucket, BUCKET_NAME } from '@/lib/editor/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id: projectId } = await context.params;

  // Ownership check
  const { data: project } = await supabaseAdmin
    .from('edit_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', auth.user.id)
    .single();
  if (!project) return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });

  // Parse form
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'BAD_FORM_DATA' }, { status: 400 }); }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });
  }
  const blob = file as unknown as Blob & { name?: string; type?: string };
  const mime = (blob.type || '').toLowerCase();

  if (!ALLOWED_TYPES.has(mime)) {
    return NextResponse.json({
      error: `UNSUPPORTED_TYPE: ${mime || 'unknown'}. Accepted: mp4, mov, webm, mkv.`,
    }, { status: 400 });
  }
  if (blob.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `FILE_TOO_LARGE: ${Math.round(blob.size / 1024 / 1024)}MB exceeds 500MB limit.`,
    }, { status: 400 });
  }

  await ensureEditJobsBucket();

  const name = sanitizeName(blob.name ?? `clip_${Date.now()}.mp4`);
  const storagePath = `${auth.user.id}/${projectId}/source/${Date.now()}_${name}`;
  const buf = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buf, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Count existing clips for sort_order
  const { count } = await supabaseAdmin
    .from('edit_source_clips')
    .select('id', { count: 'exact', head: true })
    .eq('edit_project_id', projectId)
    .eq('user_id', auth.user.id);

  const { data: clip, error: dbErr } = await supabaseAdmin
    .from('edit_source_clips')
    .insert({
      edit_project_id: projectId,
      user_id: auth.user.id,
      storage_path: storagePath,
      duration_ms: null, // detected by worker or future ffprobe step
      sort_order: (count ?? 0),
    })
    .select('*')
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ clip });
}

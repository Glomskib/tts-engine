/**
 * POST /api/videos/upload/finalize
 *
 * Pairs with /api/videos/upload/sign. After the client PUTs the file directly
 * to Supabase Storage via the signed URL, this endpoint creates (or updates)
 * the videos table row referencing the uploaded file.
 *
 * Body (JSON):
 *   {
 *     storage_path: string       // returned from /sign
 *     file_size_bytes: number    // for accurate file_size_mb
 *     content_type?: string
 *     title?: string
 *     product_id?: string        // UUID
 *     type?: 'raw' | 'edited'    // default 'raw'
 *     video_id?: string          // existing video UUID for edited uploads
 *   }
 *
 * Returns: { ok: true, video } or 4xx with { ok: false, error }
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

const BUCKET_NAME = 'video-files';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FinalizeBody {
  storage_path?: string;
  file_size_bytes?: number;
  content_type?: string;
  title?: string;
  product_id?: string;
  type?: string;
  video_id?: string;
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }
  const userId = auth.user.id;

  let body: FinalizeBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 },
    );
  }

  const storagePath = (body.storage_path ?? '').trim();
  if (!storagePath) {
    return NextResponse.json(
      { ok: false, error: 'storage_path is required' },
      { status: 400 },
    );
  }
  // Defensive: ensure the path starts with the user's own ID so a user can't
  // claim someone else's uploaded file.
  if (!storagePath.startsWith(`${userId}/`)) {
    return NextResponse.json(
      { ok: false, error: 'storage_path does not match authenticated user' },
      { status: 403 },
    );
  }

  const fileSizeBytes = Number(body.file_size_bytes ?? 0);
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return NextResponse.json(
      { ok: false, error: 'file_size_bytes must be a positive number' },
      { status: 400 },
    );
  }
  const fileSizeMb = parseFloat(
    (fileSizeBytes / (1024 * 1024)).toFixed(2),
  );

  const typeRaw = (body.type ?? 'raw').trim().toLowerCase();
  const uploadType: 'raw' | 'edited' =
    typeRaw === 'edited' ? 'edited' : 'raw';

  const productId = body.product_id?.trim() || null;
  const videoId = body.video_id?.trim() || null;
  const titleInput = body.title?.trim() || null;

  if (productId && !UUID_RE.test(productId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid product_id UUID' },
      { status: 400 },
    );
  }
  if (videoId && !UUID_RE.test(videoId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid video_id UUID' },
      { status: 400 },
    );
  }
  if (uploadType === 'edited' && !videoId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'video_id is required when type is "edited"',
      },
      { status: 400 },
    );
  }

  // Confirm the file actually exists in storage before creating the row.
  // Saves us from "ghost" video records where the upload silently failed.
  const dirPath = storagePath.substring(0, storagePath.lastIndexOf('/')) || '';
  const fileName = storagePath.substring(storagePath.lastIndexOf('/') + 1);
  const { data: listData, error: listError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .list(dirPath, { search: fileName });
  if (listError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Storage list failed: ${listError.message}`,
      },
      { status: 500 },
    );
  }
  const found = listData?.some((entry) => entry.name === fileName);
  if (!found) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Uploaded file not found in storage. Did the PUT to the signed URL succeed?',
      },
      { status: 400 },
    );
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  // Branch: new raw / attach raw to existing / edited
  if (uploadType === 'raw' && !videoId) {
    // Case A: New pipeline entry
    const filenameOnly = fileName.replace(/\.[^/.]+$/, '');
    const titleFromFilename = filenameOnly.replace(/[_-]/g, ' ');
    const videoTitle = titleInput || titleFromFilename;

    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      title: videoTitle,
      recording_status: 'NEEDS_EDIT',
      raw_video_url: publicUrl,
      file_size_mb: fileSizeMb,
      status: 'needs_edit',
    };
    if (productId) insertPayload.product_id = productId;

    const { data, error } = await supabaseAdmin
      .from('videos')
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `DB insert failed: ${error.message}`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, video: data });
  }

  if (uploadType === 'raw' && videoId) {
    // Case B: Attach raw to existing video
    const { data, error } = await supabaseAdmin
      .from('videos')
      .update({
        raw_video_url: publicUrl,
        file_size_mb: fileSizeMb,
      })
      .eq('id', videoId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `DB update failed: ${error.message}`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, video: data });
  }

  // Case C: Edited version
  const { data, error } = await supabaseAdmin
    .from('videos')
    .update({
      edited_video_url: publicUrl,
      file_size_mb: fileSizeMb,
      recording_status: 'READY_TO_POST',
      status: 'ready_to_post',
    })
    .eq('id', videoId!)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `DB update failed: ${error.message}`,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, video: data });
}

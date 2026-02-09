import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * POST /api/videos/create-from-script
 * Creates a video in the pipeline from an approved script.
 * Lightweight path for scripts without a product_id (manual product entry).
 * For scripts with product_id, prefer /api/skits/[id]/send-to-video.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { script_id, title, product_name, product_brand, hook_line } = body;

  if (!script_id || typeof script_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'script_id is required' }, { status: 400 });
  }

  // Check if a video already exists for this script via saved_skits.video_id
  const { data: skit } = await supabaseAdmin
    .from('saved_skits')
    .select('id, video_id')
    .eq('id', script_id)
    .maybeSingle();

  if (skit?.video_id) {
    return NextResponse.json({
      ok: true,
      data: { id: skit.video_id },
      message: 'Video already exists for this script',
      duplicate: true,
    });
  }

  // Create video with minimal data — use valid recording_status values only
  const { data: video, error } = await supabaseAdmin
    .from('videos')
    .insert({
      account_id: authContext.user.id,
      status: 'needs_edit',
      recording_status: 'NEEDS_SCRIPT',
      google_drive_url: '',
      script_locked_text: hook_line ? `HOOK: ${hook_line}` : null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create video from script:', error.message, error.details, error.hint);
    return NextResponse.json({ ok: false, error: `Failed to create video: ${error.message}` }, { status: 500 });
  }

  // Update the script with the video_id link
  await supabaseAdmin
    .from('saved_skits')
    .update({ video_id: video.id })
    .eq('id', script_id);

  // Write video event (fire-and-forget)
  await supabaseAdmin.from('video_events').insert({
    video_id: video.id,
    event_type: 'created_from_script',
    correlation_id: `script-approval-${Date.now()}`,
    actor: authContext.user.id,
    from_status: null,
    to_status: 'NEEDS_SCRIPT',
    details: {
      script_id,
      title: title || null,
      product_name: product_name || null,
      product_brand: product_brand || null,
    },
  }).then(
    () => {},
    (err: unknown) => { console.error('Failed to write video event:', err); }
  );

  return NextResponse.json({
    ok: true,
    data: video,
  });
}

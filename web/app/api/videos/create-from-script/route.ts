import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * POST /api/videos/create-from-script
 * Creates a video in the pipeline from an approved script.
 * No drive link or variant_id required - those are added later.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext();
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

  // Check if a video already exists for this script
  const { data: existing } = await supabaseAdmin
    .from('videos')
    .select('id')
    .eq('variant_id', `script-${script_id}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      data: existing,
      message: 'Video already exists for this script',
      duplicate: true,
    });
  }

  // Generate a video code
  const brand = typeof product_brand === 'string' ? product_brand.substring(0, 6).toUpperCase().replace(/\s/g, '') : 'SCRIPT';
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const videoCode = `${brand}-${dateStr}-${random}`;

  // Create video with minimal data
  const { data: video, error } = await supabaseAdmin
    .from('videos')
    .insert({
      variant_id: `script-${script_id}`,
      video_code: videoCode,
      account_id: authContext.user.id,
      status: 'draft',
      recording_status: 'NEEDS_CONTENT',
      google_drive_url: '',
      script_locked_text: hook_line ? `HOOK: ${hook_line}` : null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create video from script:', error);
    return NextResponse.json({ ok: false, error: 'Failed to create video' }, { status: 500 });
  }

  // Update the script with the video_id link
  await supabaseAdmin
    .from('saved_skits')
    .update({ video_id: video.id })
    .eq('id', script_id);

  // Write video event
  await supabaseAdmin.from('video_events').insert({
    video_id: video.id,
    event_type: 'created_from_script',
    correlation_id: `script-approval-${Date.now()}`,
    actor: authContext.user.id,
    from_status: null,
    to_status: 'draft',
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
    video_code: videoCode,
  });
}

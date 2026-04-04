/**
 * POST /api/packs/export
 *
 * Generate a ZIP file containing Recording Packs or Editing Packs for selected videos.
 *
 * Body: { video_ids: string[], pack_type: 'recording' | 'editing' }
 * Returns: ZIP file as application/zip
 */

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { buildRecordingPack, formatRecordingPackMarkdown, type RecordingPackVideo } from '@/lib/packs/buildRecordingPack';
import { buildEditingPack, formatEditingPackMarkdown, type EditingPackVideo } from '@/lib/packs/buildEditingPack';

export const runtime = 'nodejs';

const MAX_VIDEOS = 50;

interface RequestBody {
  video_ids: string[];
  pack_type: 'recording' | 'editing';
}

export async function POST(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { video_ids, pack_type } = body;
  if (!Array.isArray(video_ids) || video_ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'video_ids must be a non-empty array' }, { status: 400 });
  }
  if (video_ids.length > MAX_VIDEOS) {
    return NextResponse.json({ ok: false, error: `Maximum ${MAX_VIDEOS} videos per export` }, { status: 400 });
  }
  if (pack_type !== 'recording' && pack_type !== 'editing') {
    return NextResponse.json({ ok: false, error: 'pack_type must be "recording" or "editing"' }, { status: 400 });
  }

  try {
    // Fetch videos with related data
    const { data: videos, error: dbError } = await supabaseAdmin
      .from('videos')
      .select(`
        id, video_code, recording_status, script_locked_text, blocked_reason,
        google_drive_url, final_video_url, posted_platform,
        concept:concept_id (
          id, title, core_angle, hook_options, notes, visual_hook,
          on_screen_text_hook, on_screen_text_mid, on_screen_text_cta,
          hook_type, tone_preset
        ),
        product:product_id (
          id, name, brand, product_url
        ),
        posting_account:posting_account_id (
          display_name, platform
        )
      `)
      .in('id', video_ids);

    if (dbError) {
      console.error('Pack export DB error:', dbError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch videos' }, { status: 500 });
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json({ ok: false, error: 'No videos found' }, { status: 404 });
    }

    // Build ZIP
    const zip = new JSZip();
    const isMultiple = videos.length > 1;
    const packsFolder = isMultiple ? zip.folder('packs') : zip;

    for (const video of videos) {
      const videoData = {
        id: video.id,
        video_code: video.video_code,
        brand_name: (video.product as { brand?: string })?.brand || null,
        product_name: (video.product as { name?: string })?.name || null,
        script_locked_text: video.script_locked_text,
        blocked_reason: video.blocked_reason,
        recording_status: video.recording_status,
        google_drive_url: video.google_drive_url,
        final_video_url: video.final_video_url,
        posted_platform: video.posted_platform,
        concept: video.concept as RecordingPackVideo['concept'],
        posting_account: video.posting_account as EditingPackVideo['posting_account'],
      };

      const safeName = (video.video_code || video.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
      const folder = isMultiple ? packsFolder!.folder(safeName) : packsFolder;

      if (!folder) continue;

      if (pack_type === 'recording') {
        const pack = buildRecordingPack(videoData);
        const md = formatRecordingPackMarkdown(pack);

        folder.file('recording-pack.md', md);
        folder.file('video-title.txt', pack.title);
        if (pack.script) folder.file('script.md', pack.script);
        if (pack.hookLine) folder.file('hook.md', pack.hookLine);
        if (pack.ctaLine) folder.file('cta.md', pack.ctaLine);
        if (pack.scenes.length > 0) {
          const beats = pack.scenes
            .map(s => `## Scene ${s.scene}\n**Framing:** ${s.framing}\n**Action:** ${s.action}\n**Lines:** ${s.lines}${s.overlay ? `\n**Overlay:** ${s.overlay}` : ''}`)
            .join('\n\n');
          folder.file('beats.md', beats);
        }
        if (pack.overlays.length > 0) {
          folder.file('overlays.md', pack.overlays.join('\n'));
        }
        if (pack.filmingNotes.length > 0) {
          folder.file('filming-notes.md', pack.filmingNotes.join('\n'));
        }
      } else {
        const pack = buildEditingPack(videoData);
        const md = formatEditingPackMarkdown(pack);

        folder.file('editing-pack.md', md);
        folder.file('video-title.txt', pack.title);
        if (pack.script) folder.file('script.md', pack.script);
        if (pack.overlays.length > 0) folder.file('overlays.md', pack.overlays.join('\n'));
        if (pack.ctaLine) folder.file('cta.md', pack.ctaLine);
        if (pack.captionOptions.length > 0) folder.file('captions.md', pack.captionOptions.join('\n\n'));
        if (pack.hashtags.length > 0) folder.file('hashtags.md', pack.hashtags.join(' '));
        if (pack.brollSuggestions.length > 0) folder.file('b-roll.md', pack.brollSuggestions.join('\n'));
      }
    }

    const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const filename = `${pack_type}-pack${isMultiple ? `s-${videos.length}` : ''}.zip`;

    return new NextResponse(zipData as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Pack export error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/intake/trigger-poll
 * Manually triggers a poll for the current user's connector (admin/owner action).
 * Calls the poll logic inline for a single connector.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listVideoFiles } from '@/lib/intake/google-drive';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authContext.user.id;

  const { data: connector } = await supabaseAdmin
    .from('drive_intake_connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'CONNECTED')
    .single();

  if (!connector) {
    return NextResponse.json({ error: 'No connected Drive connector found' }, { status: 400 });
  }

  if (!connector.folder_id) {
    return NextResponse.json({ error: 'No folder selected — select a folder first' }, { status: 400 });
  }

  try {
    const { files } = await listVideoFiles(userId, connector.folder_id);
    let newFiles = 0;

    for (const file of files) {
      const { error: eventErr } = await supabaseAdmin
        .from('drive_intake_events')
        .insert({
          user_id: userId,
          drive_file_id: file.id,
          drive_file_name: file.name,
          drive_mime_type: file.mimeType,
          drive_md5: file.md5Checksum,
          drive_size_bytes: file.size,
          drive_modified_ts: file.modifiedTime || null,
          status: 'NEW',
        })
        .select('id')
        .single();

      if (eventErr) {
        if (eventErr.code === '23505') continue;
        continue;
      }

      await supabaseAdmin
        .from('drive_intake_jobs')
        .insert({
          user_id: userId,
          connector_id: connector.id,
          drive_file_id: file.id,
          drive_file_name: file.name,
          status: 'PENDING',
        });

      await supabaseAdmin
        .from('drive_intake_events')
        .update({ status: 'QUEUED', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('drive_file_id', file.id);

      newFiles++;
    }

    await supabaseAdmin
      .from('drive_intake_connectors')
      .update({
        last_poll_at: new Date().toISOString(),
        last_poll_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connector.id);

    return NextResponse.json({
      ok: true,
      filesFound: files.length,
      newFiles,
      message: newFiles > 0
        ? `Found ${newFiles} new video(s) — queued for processing`
        : `No new videos found (${files.length} total in folder)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

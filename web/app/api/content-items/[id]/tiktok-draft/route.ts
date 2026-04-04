import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { pollDraftExportStatus } from '@/lib/tiktok-draft-export';
import { captureRouteException } from '@/lib/errorTracking';

export const runtime = 'nodejs';

/**
 * POST /api/content-items/[id]/tiktok-draft
 * Trigger a TikTok draft export for a rendered content item.
 * Body: { account_id: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { account_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountId = body.account_id;
  if (!accountId) {
    return NextResponse.json({ ok: false, error: 'account_id is required' }, { status: 400 });
  }

  // Verify content item exists and belongs to user's workspace
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('content_items')
    .select('id, workspace_id, rendered_video_url, tiktok_draft_status')
    .eq('id', id)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ ok: false, error: 'Content item not found' }, { status: 404 });
  }

  if (!item.rendered_video_url) {
    return NextResponse.json(
      { ok: false, error: 'No rendered video — render the video first' },
      { status: 400 },
    );
  }

  if (item.tiktok_draft_status === 'processing') {
    return NextResponse.json(
      { ok: false, error: 'Draft export already in progress' },
      { status: 409 },
    );
  }

  // Verify account belongs to user
  const { data: account } = await supabaseAdmin
    .from('tiktok_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', authContext.user.id)
    .single();

  if (!account) {
    return NextResponse.json({ ok: false, error: 'TikTok account not found' }, { status: 404 });
  }

  // Verify active content connection exists
  const { data: conn } = await supabaseAdmin
    .from('tiktok_content_connections')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .single();

  if (!conn) {
    return NextResponse.json(
      { ok: false, error: 'No active TikTok Content connection. Connect in Settings → TikTok first.' },
      { status: 400 },
    );
  }

  // Mark as pending immediately
  await supabaseAdmin
    .from('content_items')
    .update({
      tiktok_draft_status: 'pending',
      tiktok_draft_account_id: accountId,
      tiktok_draft_error: null,
      tiktok_draft_requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Enqueue job for async processing
  try {
    const jobId = await enqueueJob(item.workspace_id, 'tiktok_draft_export', {
      content_item_id: id,
      account_id: accountId,
      actor_id: authContext.user.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        status: 'pending',
        job_id: jobId,
        message: 'Draft export queued — video will be sent to your TikTok inbox',
      },
    });
  } catch (err) {
    captureRouteException(err instanceof Error ? err : new Error(String(err)), {
      route: `/api/content-items/${id}/tiktok-draft`,
      action: 'enqueue',
    });

    // Revert status
    await supabaseAdmin
      .from('content_items')
      .update({
        tiktok_draft_status: 'failed',
        tiktok_draft_error: 'Failed to queue export job',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json(
      { ok: false, error: 'Failed to queue draft export' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/content-items/[id]/tiktok-draft
 * Poll the TikTok draft export status for a content item.
 * If status is 'processing', checks TikTok API for updates.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await pollDraftExportStatus(id);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    captureRouteException(err instanceof Error ? err : new Error(String(err)), {
      route: `/api/content-items/${id}/tiktok-draft`,
      action: 'poll',
    });
    return NextResponse.json(
      { ok: false, error: 'Failed to check draft status' },
      { status: 500 },
    );
  }
}

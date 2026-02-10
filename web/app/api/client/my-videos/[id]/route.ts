/**
 * Client Video Request Detail API
 * Get and update a client's video editing request.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendVideoCompletedEmail,
  sendRevisionRequestedEmail,
} from '@/lib/client-email-notifications';

/**
 * GET: Get specific video request for the authenticated client
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Get the request - user must be the owner
  const { data, error } = await supabaseAdmin
    .from('video_requests')
    .select(`
      *,
      script:script_id(title)
    `)
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...data,
      script_title: data.script?.title || null,
      script: undefined,
    },
  });
}

/**
 * PATCH: Update video request (client can approve or request revision)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  // Get current request
  const { data: currentRequest, error: fetchError } = await supabaseAdmin
    .from('video_requests')
    .select(`
      *,
      editor:assigned_editor_id(email)
    `)
    .eq('id', id)
    .eq('user_id', authContext.user.id)
    .single();

  if (fetchError || !currentRequest) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  // Client can only act on requests in 'review' status
  if (currentRequest.status !== 'review') {
    return NextResponse.json({
      ok: false,
      error: 'Can only approve or request revisions for videos in review status',
    }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const { action, revision_notes } = body;

  if (action === 'approve') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  } else if (action === 'revision') {
    if (!revision_notes?.trim()) {
      return NextResponse.json({
        ok: false,
        error: 'Please provide revision notes explaining what changes you need',
      }, { status: 400 });
    }
    updates.status = 'revision';
    updates.revision_count = (currentRequest.revision_count || 0) + 1;
    updates.revision_notes = revision_notes.trim();
  } else {
    return NextResponse.json({
      ok: false,
      error: 'Invalid action. Use "approve" or "revision"',
    }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('video_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update video request:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update request' }, { status: 500 });
  }

  // Send notifications
  const editorEmail = currentRequest.editor?.email;

  if (action === 'approve' && currentRequest.edited_drive_link) {
    // Notify client of completion
    try {
      await sendVideoCompletedEmail({
        recipientEmail: authContext.user.email || '',
        requestId: id,
        requestTitle: currentRequest.title,
        editedDriveLink: currentRequest.edited_drive_link,
      });
    } catch (emailError) {
      console.error('Failed to send completion email:', emailError);
    }
  } else if (action === 'revision' && editorEmail) {
    // Notify editor of revision request
    try {
      await sendRevisionRequestedEmail({
        recipientEmail: editorEmail,
        requestId: id,
        requestTitle: currentRequest.title,
        revisionNotes: revision_notes,
        revisionNumber: data.revision_count,
      });
    } catch (emailError) {
      console.error('Failed to send revision email:', emailError);
    }
  }

  return NextResponse.json({ ok: true, data });
}

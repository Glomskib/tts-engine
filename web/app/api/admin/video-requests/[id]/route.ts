/**
 * Admin Video Request Detail API
 * Get and update a specific video request (admin only).
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendVideoReadyForReviewEmail,
  sendVideoCompletedEmail,
  sendRevisionRequestedEmail,
} from '@/lib/client-email-notifications';

/**
 * GET: Get specific video request with all details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext();
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('video_requests')
    .select(`
      *,
      user:user_id(id, email),
      editor:assigned_editor_id(id, email),
      script:script_id(id, title, final_script)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  // Get activity log (if we have a request_activity table)
  // For now, we'll simulate with timestamps
  const activity = [
    { action: 'created', timestamp: data.created_at, actor: data.user?.email },
    data.assigned_at && { action: 'assigned', timestamp: data.assigned_at, actor: 'Admin', details: `Assigned to ${data.editor?.email}` },
    data.status === 'in_progress' && { action: 'started', timestamp: data.updated_at },
    data.status === 'review' && { action: 'submitted_for_review', timestamp: data.updated_at },
    data.completed_at && { action: 'completed', timestamp: data.completed_at },
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    data: {
      ...data,
      user_email: data.user?.email || null,
      editor_email: data.editor?.email || null,
      script_title: data.script?.title || null,
      script_content: data.script?.final_script || null,
      activity,
    },
  });
}

/**
 * PATCH: Update video request (admin)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext();
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  // Admin can update all fields
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    if (body.status === 'in_progress' && !body.assigned_editor_id) {
      // Can't be in progress without assignment
    }
  }

  if (body.assigned_editor_id !== undefined) {
    updates.assigned_editor_id = body.assigned_editor_id;
    updates.assigned_at = body.assigned_editor_id ? new Date().toISOString() : null;
    // Auto-update status to assigned if pending
    if (body.assigned_editor_id && !body.status) {
      updates.status = 'assigned';
    }
  }

  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.due_date !== undefined) updates.due_date = body.due_date;
  if (body.edited_drive_link !== undefined) updates.edited_drive_link = body.edited_drive_link;
  if (body.revision_notes !== undefined) updates.revision_notes = body.revision_notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No updates provided' }, { status: 400 });
  }

  // Get current request for comparison and notification data
  const { data: currentRequest } = await supabaseAdmin
    .from('video_requests')
    .select(`
      *,
      user:user_id(email),
      editor:assigned_editor_id(email)
    `)
    .eq('id', id)
    .single();

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

  // Send notifications based on status changes
  const newStatus = updates.status as string | undefined;
  const clientEmail = currentRequest?.user?.email;
  const editorEmail = currentRequest?.editor?.email;

  if (newStatus && clientEmail) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const reviewUrl = `${appUrl}/client/my-videos/${id}`;

    try {
      if (newStatus === 'review' && data.edited_drive_link) {
        // Video submitted for review - notify client
        await sendVideoReadyForReviewEmail({
          recipientEmail: clientEmail,
          requestId: id,
          requestTitle: currentRequest?.title || 'Your video',
          editedDriveLink: data.edited_drive_link,
          reviewUrl,
        });
      } else if (newStatus === 'completed' && data.edited_drive_link) {
        // Video approved and completed - notify client
        await sendVideoCompletedEmail({
          recipientEmail: clientEmail,
          requestId: id,
          requestTitle: currentRequest?.title || 'Your video',
          editedDriveLink: data.edited_drive_link,
        });
      }
    } catch (emailError) {
      console.error('Failed to send client notification:', emailError);
      // Don't fail the request if email fails
    }
  }

  // Notify editor of revision request
  if (newStatus === 'revision' && editorEmail && body.revision_notes) {
    try {
      await sendRevisionRequestedEmail({
        recipientEmail: editorEmail,
        requestId: id,
        requestTitle: currentRequest?.title || 'Video request',
        revisionNotes: body.revision_notes,
        revisionNumber: (currentRequest?.revision_count || 0) + 1,
      });
    } catch (emailError) {
      console.error('Failed to send editor notification:', emailError);
    }
  }

  return NextResponse.json({ ok: true, data });
}

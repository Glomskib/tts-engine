/**
 * Video Request Detail API
 * Get, update, or cancel a specific video request.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET: Get specific video request
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Build query - users can only see their own, admins/editors can see assigned
  let query = supabaseAdmin
    .from('video_requests')
    .select('*')
    .eq('id', id);

  if (!authContext.isAdmin) {
    query = query.or(`user_id.eq.${authContext.user.id},assigned_editor_id.eq.${authContext.user.id}`);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * PATCH: Update video request
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  // First, get the request to check permissions
  const { data: existingRequest, error: fetchError } = await supabaseAdmin
    .from('video_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existingRequest) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  // Check permissions
  const isOwner = existingRequest.user_id === authContext.user.id;
  const isEditor = existingRequest.assigned_editor_id === authContext.user.id;

  if (!isOwner && !isEditor && !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Permission denied' }, { status: 403 });
  }

  // Build update object based on role
  const updates: Record<string, unknown> = {};

  // Owner can update these
  if (isOwner || authContext.isAdmin) {
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.source_drive_link !== undefined) updates.source_drive_link = body.source_drive_link;
    if (body.revision_notes !== undefined) updates.revision_notes = body.revision_notes;
  }

  // Editor can update these
  if (isEditor || authContext.isAdmin) {
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }
    }
    if (body.edited_drive_link !== undefined) updates.edited_drive_link = body.edited_drive_link;
  }

  // Admin only
  if (authContext.isAdmin) {
    if (body.assigned_editor_id !== undefined) {
      updates.assigned_editor_id = body.assigned_editor_id;
      updates.assigned_at = body.assigned_editor_id ? new Date().toISOString() : null;
      if (body.assigned_editor_id && existingRequest.status === 'pending') {
        updates.status = 'assigned';
      }
    }
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
  }

  // Handle revision request from owner
  if (isOwner && body.request_revision && existingRequest.status === 'review') {
    updates.status = 'revision';
    updates.revision_count = (existingRequest.revision_count || 0) + 1;
    updates.revision_notes = body.revision_notes;
  }

  // Handle approval from owner
  if (isOwner && body.approve && existingRequest.status === 'review') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid updates provided' }, { status: 400 });
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

  return NextResponse.json({ ok: true, data });
}

/**
 * DELETE: Cancel video request (owner only, pending status only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Get the request
  const { data: existingRequest, error: fetchError } = await supabaseAdmin
    .from('video_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existingRequest) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  // Only owner can cancel, and only if pending
  if (existingRequest.user_id !== authContext.user.id && !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Permission denied' }, { status: 403 });
  }

  if (existingRequest.status !== 'pending' && !authContext.isAdmin) {
    return NextResponse.json({
      ok: false,
      error: 'Can only cancel pending requests. Contact support for other requests.',
    }, { status: 400 });
  }

  // Update to cancelled status
  const { error } = await supabaseAdmin
    .from('video_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) {
    console.error('Failed to cancel video request:', error);
    return NextResponse.json({ ok: false, error: 'Failed to cancel request' }, { status: 500 });
  }

  // Refund video quota (add back 1 video)
  if (existingRequest.status === 'pending') {
    await supabaseAdmin.rpc('add_credits', {
      p_user_id: existingRequest.user_id,
      p_amount: 0, // Not adding credits
    });
    // Actually update videos_remaining
    await supabaseAdmin
      .from('user_subscriptions')
      .update({
        videos_remaining: supabaseAdmin.rpc('sql', { query: 'videos_remaining + 1' }),
      })
      .eq('user_id', existingRequest.user_id);
  }

  return NextResponse.json({ ok: true, message: 'Request cancelled' });
}

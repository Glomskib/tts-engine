/**
 * Editor Video Requests API
 * List video requests assigned to the current editor.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET: List video requests assigned to the current editor
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const includeCompleted = searchParams.get('include_completed') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabaseAdmin
    .from('video_requests')
    .select(`
      *,
      user:user_id(email),
      script:script_id(title)
    `)
    .eq('assigned_editor_id', authContext.user.id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  } else if (!includeCompleted) {
    // By default, exclude completed and cancelled
    query = query.not('status', 'in', '("completed","cancelled")');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch editor video requests:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch requests' }, { status: 500 });
  }

  // Transform and add computed fields
  const requests = (data || []).map((req) => {
    const isOverdue = req.due_date && new Date(req.due_date) < new Date() && !['completed', 'cancelled'].includes(req.status);

    return {
      ...req,
      user_email: req.user?.email || null,
      script_title: req.script?.title || null,
      is_overdue: isOverdue,
      user: undefined,
      script: undefined,
    };
  });

  // Stats
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'assigned').length,
    in_progress: requests.filter(r => ['in_progress', 'revision'].includes(r.status)).length,
    in_review: requests.filter(r => r.status === 'review').length,
    overdue: requests.filter(r => r.is_overdue).length,
  };

  return NextResponse.json({ ok: true, data: requests, stats });
}

/**
 * PATCH: Update a video request (editor can update status and delivery link)
 */
export async function PATCH(request: Request) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, status, edited_drive_link } = body;

  if (!id) {
    return NextResponse.json({ ok: false, error: 'Request ID required' }, { status: 400 });
  }

  // Verify the editor is assigned to this request
  const { data: existingRequest, error: fetchError } = await supabaseAdmin
    .from('video_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existingRequest) {
    return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 });
  }

  // Check if user is the assigned editor or admin
  if (existingRequest.assigned_editor_id !== authContext.user.id && !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'You are not assigned to this request' }, { status: 403 });
  }

  // Build updates
  const updates: Record<string, unknown> = {};

  // Valid status transitions for editors
  const validTransitions: Record<string, string[]> = {
    assigned: ['in_progress'],
    in_progress: ['review'],
    revision: ['review'],
    review: [], // Only admin can complete
  };

  if (status !== undefined) {
    const currentStatus = existingRequest.status;
    const allowed = validTransitions[currentStatus] || [];

    if (!allowed.includes(status) && !authContext.isAdmin) {
      return NextResponse.json({
        ok: false,
        error: `Cannot transition from ${currentStatus} to ${status}`,
      }, { status: 400 });
    }

    updates.status = status;
  }

  if (edited_drive_link !== undefined) {
    updates.edited_drive_link = edited_drive_link;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No updates provided' }, { status: 400 });
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

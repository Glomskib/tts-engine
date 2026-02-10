/**
 * Admin Video Requests API
 * List and manage all video editing requests.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface VideoRequest {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  script_id: string | null;
  source_drive_link: string;
  edited_drive_link: string | null;
  status: 'pending' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'completed' | 'cancelled';
  assigned_editor_id: string | null;
  assigned_at: string | null;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  revision_count: number;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_email?: string;
  editor_email?: string;
  script_title?: string;
}

/**
 * GET: List all video requests (admin only)
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const editorId = searchParams.get('editor_id');
  const userId = searchParams.get('user_id');
  const priority = searchParams.get('priority');
  const overdue = searchParams.get('overdue');
  const limit = parseInt(searchParams.get('limit') || '100');

  let query = supabaseAdmin
    .from('video_requests')
    .select(`
      *,
      user:user_id(email),
      editor:assigned_editor_id(email),
      script:script_id(title)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  if (editorId) {
    if (editorId === 'unassigned') {
      query = query.is('assigned_editor_id', null);
    } else {
      query = query.eq('assigned_editor_id', editorId);
    }
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (priority) {
    query = query.eq('priority', parseInt(priority));
  }

  if (overdue === 'true') {
    query = query.lt('due_date', new Date().toISOString());
    query = query.not('status', 'in', '("completed","cancelled")');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch video requests:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch requests' }, { status: 500 });
  }

  // Transform data to flatten joined fields
  const requests = (data || []).map((req) => ({
    ...req,
    user_email: req.user?.email || null,
    editor_email: req.editor?.email || null,
    script_title: req.script?.title || null,
    user: undefined,
    editor: undefined,
    script: undefined,
  }));

  return NextResponse.json({ ok: true, data: requests });
}

/**
 * PATCH: Bulk update video requests
 */
export async function PATCH(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { ids, updates } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'No request IDs provided' }, { status: 400 });
  }

  // Sanitize updates - only allow certain fields
  const allowedFields = ['status', 'assigned_editor_id', 'priority', 'due_date'];
  const sanitizedUpdates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitizedUpdates[field] = updates[field];
    }
  }

  if (sanitizedUpdates.assigned_editor_id) {
    sanitizedUpdates.assigned_at = new Date().toISOString();
  }

  if (Object.keys(sanitizedUpdates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid updates provided' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('video_requests')
    .update(sanitizedUpdates)
    .in('id', ids);

  if (error) {
    console.error('Failed to update video requests:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update requests' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: ids.length });
}

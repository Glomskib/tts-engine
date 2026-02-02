/**
 * Admin Editors API
 * List users who can be assigned as video editors.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface Editor {
  id: string;
  email: string;
  assigned_count: number;
  completed_count: number;
}

/**
 * GET: List all editors (admins and users with editor role)
 */
export async function GET() {
  const authContext = await getApiAuthContext();
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  // Get all admins and users who have been assigned as editors before
  // In a real system, you'd have a roles table, but for now we'll use:
  // 1. Users who are admins
  // 2. Users who have been assigned to video requests

  // First, get admin emails from environment
  const adminEmails = (process.env.ADMIN_USERS || '').split(',').filter(Boolean);

  // Get users by admin emails
  const { data: adminUsers } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .or(adminEmails.map(e => `email.eq.${e}`).join(','));

  // Get users who have been assigned as editors
  const { data: editorAssignments } = await supabaseAdmin
    .from('video_requests')
    .select('assigned_editor_id')
    .not('assigned_editor_id', 'is', null);

  const uniqueEditorIds = [...new Set(editorAssignments?.map(a => a.assigned_editor_id) || [])];

  // Get those user profiles
  const { data: editorUsers } = uniqueEditorIds.length > 0
    ? await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .in('id', uniqueEditorIds)
    : { data: [] };

  // Merge admin and editor users
  const allEditors = new Map<string, { id: string; email: string }>();

  (adminUsers || []).forEach(u => {
    if (u.id && u.email) {
      allEditors.set(u.id, { id: u.id, email: u.email });
    }
  });

  (editorUsers || []).forEach(u => {
    if (u.id && u.email) {
      allEditors.set(u.id, { id: u.id, email: u.email });
    }
  });

  // Get assignment counts for each editor
  const editors: Editor[] = [];

  for (const editor of allEditors.values()) {
    const { count: assignedCount } = await supabaseAdmin
      .from('video_requests')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_editor_id', editor.id)
      .not('status', 'in', '("completed","cancelled")');

    const { count: completedCount } = await supabaseAdmin
      .from('video_requests')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_editor_id', editor.id)
      .eq('status', 'completed');

    editors.push({
      id: editor.id,
      email: editor.email,
      assigned_count: assignedCount || 0,
      completed_count: completedCount || 0,
    });
  }

  // Sort by assigned count (least loaded first)
  editors.sort((a, b) => a.assigned_count - b.assigned_count);

  return NextResponse.json({ ok: true, data: editors });
}

/**
 * GET /api/admin/editors/managed
 * List editors with their video assignment counts for the Client Management page.
 * Separate from the existing /api/admin/editors which lists assignment-eligible editors.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    // Get all users with editor role from user_roles table
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .eq('role', 'editor');

    if (roleError) throw roleError;

    const editorUserIds = (roleRows ?? []).map(r => r.user_id);

    if (editorUserIds.length === 0) {
      return NextResponse.json({ editors: [] });
    }

    // Get profiles for these users
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, created_at')
      .in('id', editorUserIds);

    // Get video assignment counts in one query
    const { data: videoCounts } = await supabaseAdmin
      .from('videos')
      .select('assigned_to')
      .in('assigned_to', editorUserIds)
      .eq('assignment_state', 'ASSIGNED');

    const countMap: Record<string, number> = {};
    videoCounts?.forEach(v => {
      if (v.assigned_to) {
        countMap[v.assigned_to] = (countMap[v.assigned_to] || 0) + 1;
      }
    });

    const editors = (profiles ?? []).map(p => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      created_at: p.created_at,
      assigned_videos_count: countMap[p.id] || 0,
    }));

    // Sort by name/email
    editors.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

    return NextResponse.json({ editors });
  } catch (error) {
    console.error('Error fetching managed editors:', error);
    return NextResponse.json({ error: 'Failed to fetch editors' }, { status: 500 });
  }
}

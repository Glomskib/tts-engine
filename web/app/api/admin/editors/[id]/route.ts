/**
 * DELETE /api/admin/editors/[id]
 * Remove an editor: unassign their videos and downgrade role.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const authContext = await getApiAuthContext();
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid editor ID' }, { status: 400 });
  }

  try {
    // Unassign all videos from this editor
    await supabaseAdmin
      .from('videos')
      .update({ assigned_to: null, assignment_state: 'UNASSIGNED' })
      .eq('assigned_to', id)
      .eq('assignment_state', 'ASSIGNED');

    // Remove editor role
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', id)
      .eq('role', 'editor');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error removing editor:', error);
    return NextResponse.json({ error: 'Failed to remove editor' }, { status: 500 });
  }
}

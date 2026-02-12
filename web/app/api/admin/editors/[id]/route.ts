/**
 * DELETE /api/admin/editors/[id]
 * Remove an editor: unassign their videos and downgrade role.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid editor ID', 400, correlationId);
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
    return createApiErrorResponse('INTERNAL', 'Failed to remove editor', 500, correlationId);
  }
}

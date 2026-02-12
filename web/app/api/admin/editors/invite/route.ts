/**
 * POST /api/admin/editors/invite
 * Invite a new user as an editor via Supabase Auth.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    return createApiErrorResponse('BAD_REQUEST', 'Valid email required', 400, correlationId);
  }

  try {
    // Invite user via Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { role: 'editor' },
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        // User exists — just set their role to editor
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users.find(u => u.email === email);

        if (existingUser) {
          await supabaseAdmin.from('user_roles').upsert(
            { user_id: existingUser.id, role: 'editor' },
            { onConflict: 'user_id' }
          );
          return NextResponse.json({ ok: true, user_id: existingUser.id, existing: true });
        }
        return createApiErrorResponse('BAD_REQUEST', 'User exists but could not be found', 400, correlationId);
      }
      throw error;
    }

    // Set role in user_roles table
    if (data.user) {
      await supabaseAdmin.from('user_roles').upsert(
        { user_id: data.user.id, role: 'editor' },
        { onConflict: 'user_id' }
      );
    }

    return NextResponse.json({ ok: true, user_id: data.user?.id });
  } catch (error) {
    console.error('Error inviting editor:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to invite editor', 500, correlationId);
  }
}

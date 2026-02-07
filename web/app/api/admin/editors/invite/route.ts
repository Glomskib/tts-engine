/**
 * POST /api/admin/editors/invite
 * Invite a new user as an editor via Supabase Auth.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  const authContext = await getApiAuthContext();
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
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
        return NextResponse.json({ error: 'User exists but could not be found' }, { status: 400 });
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
    return NextResponse.json({ error: 'Failed to invite editor' }, { status: 500 });
  }
}

/**
 * GET /api/intake/google/callback
 * Google OAuth callback — exchanges code for tokens, stores encrypted, redirects to intake page.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { exchangeCodeAndStore } from '@/lib/intake/google-drive';

export const runtime = 'nodejs';

const INTAKE_PAGE = '/admin/intake';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`${INTAKE_PAGE}?error=${encodeURIComponent(error)}`, url.origin));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL(`${INTAKE_PAGE}?error=missing_code`, url.origin));
  }

  // Decode state
  let userId: string;
  try {
    const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    userId = state.userId;
    // Reject stale states (> 10 min)
    if (Date.now() - state.ts > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL(`${INTAKE_PAGE}?error=state_expired`, url.origin));
    }
  } catch {
    return NextResponse.redirect(new URL(`${INTAKE_PAGE}?error=invalid_state`, url.origin));
  }

  try {
    const { email } = await exchangeCodeAndStore(code, userId);

    // Upsert connector row
    await supabaseAdmin
      .from('drive_intake_connectors')
      .upsert({
        user_id: userId,
        provider: 'google_drive',
        status: 'CONNECTED',
        google_email: email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id', ignoreDuplicates: false })
      .select()
      .single();

    // Handle potential upsert issue: if no onConflict on user_id, do insert-or-update
    const { data: existing } = await supabaseAdmin
      .from('drive_intake_connectors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existing) {
      await supabaseAdmin
        .from('drive_intake_connectors')
        .insert({
          user_id: userId,
          provider: 'google_drive',
          status: 'CONNECTED',
          google_email: email,
        });
    } else {
      await supabaseAdmin
        .from('drive_intake_connectors')
        .update({
          status: 'CONNECTED',
          google_email: email,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    return NextResponse.redirect(new URL(`${INTAKE_PAGE}?connected=true`, url.origin));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[intake:callback] Error:', msg);
    return NextResponse.redirect(new URL(`${INTAKE_PAGE}?error=${encodeURIComponent(msg)}`, url.origin));
  }
}

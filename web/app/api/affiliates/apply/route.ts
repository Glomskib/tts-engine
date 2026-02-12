import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { platform?: string; followerCount?: number; note?: string; payoutEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Check if already applied
  const { data: existing } = await supabaseAdmin
    .from('affiliate_accounts')
    .select('id, status')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({
      ok: false,
      error: `You already have an affiliate application (status: ${existing.status})`,
      status: existing.status,
    }, { status: 409 });
  }

  // Create application
  const { data: account, error } = await supabaseAdmin
    .from('affiliate_accounts')
    .insert({
      user_id: user.id,
      status: 'pending',
      platform: body.platform || null,
      follower_count: body.followerCount || null,
      application_note: body.note || null,
      payout_email: body.payoutEmail || user.email || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Affiliate application error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to submit application' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: account });
}

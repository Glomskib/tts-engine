/**
 * Brand Invite Click Tracking
 * POST /api/brand-invites/[code]/click
 * Public endpoint — increments click count.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    await supabaseAdmin.rpc('increment_brand_invite_clicks', {
      p_invite_code: code,
    });
  } catch {
    // Fallback: manual increment if RPC doesn't exist yet
    await supabaseAdmin
      .from('brand_invites')
      .update({ click_count: 1 })
      .eq('invite_code', code);
  }

  return NextResponse.json({ ok: true });
}

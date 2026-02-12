/**
 * Brand Invite Lookup
 * GET /api/brand-invites/[code]
 * Public endpoint — returns brand name and logo for the invite page.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const { data: invite, error } = await supabaseAdmin
    .from('brand_invites')
    .select('id, invite_code, brand_id, is_active, expires_at')
    .eq('invite_code', code)
    .eq('is_active', true)
    .single();

  if (error || !invite) {
    return NextResponse.json(
      { ok: false, message: 'Invite not found or expired' },
      { status: 404 },
    );
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json(
      { ok: false, message: 'This invite has expired' },
      { status: 410 },
    );
  }

  // Get brand details
  const { data: brand } = await supabaseAdmin
    .from('brands')
    .select('name, logo_url')
    .eq('id', invite.brand_id)
    .single();

  return NextResponse.json({
    ok: true,
    data: {
      brand_name: brand?.name || 'Unknown Brand',
      brand_logo: brand?.logo_url || null,
      invite_code: invite.invite_code,
    },
  });
}

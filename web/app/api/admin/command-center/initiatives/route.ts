/**
 * GET /api/admin/command-center/initiatives
 *
 * Owner-only. Returns all initiatives for filtering dropdowns.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from('initiatives')
    .select('id, slug, title, type, status')
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data || [] });
}

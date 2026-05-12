/**
 * GET /api/create/brand-profiles — list active brand voice profiles for /create's Brand dropdown.
 *
 * Returns from the `brand_profiles` table (created in the new migration).
 * Each profile shapes hook ranking, caption rewriting, and color/font choice
 * for the user's renders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // Reads can fail gracefully if the table doesn't exist yet — return empty.
  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .select('id, name, tone_descriptor, brand_color, brand_font, active')
    .eq('user_id', auth.user.id)
    .eq('active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    // Table missing or other DB error — soft-fail so the UI still works.
    return NextResponse.json({ ok: true, profiles: [] });
  }

  return NextResponse.json({ ok: true, profiles: data || [] });
}

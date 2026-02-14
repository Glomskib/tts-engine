import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json(null, { status: 401 });

  const { data } = await supabaseAdmin
    .from('creator_dna')
    .select('*')
    .eq('user_id', auth.user.id)
    .single();

  return NextResponse.json(data || null);
}

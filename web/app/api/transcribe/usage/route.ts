import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

const LIMIT_ANON = 10;
const LIMIT_LOGGED_IN = 50;

export async function GET(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

  const auth = await getApiAuthContext(request);
  const userId = auth.user?.id ?? null;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const limit = userId ? LIMIT_LOGGED_IN : LIMIT_ANON;

  let query = supabaseAdmin
    .from('transcribe_usage')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('ip', ip).is('user_id', null);
  }

  const { count } = await query;
  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  return NextResponse.json({
    used,
    limit,
    remaining,
    loggedIn: !!userId,
  });
}

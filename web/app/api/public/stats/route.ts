import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const revalidate = 300;

const FLOOR = { creators: 500, scripts: 10000 };

export async function GET() {
  try {
    const [creators, scripts] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('scripts').select('id', { count: 'exact', head: true }),
    ]);

    const creatorCount = Math.max(FLOOR.creators, creators.count ?? 0);
    const scriptCount = Math.max(FLOOR.scripts, scripts.count ?? 0);

    return NextResponse.json(
      { creatorCount, scriptCount, rating: 4.8 },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } },
    );
  } catch {
    return NextResponse.json(
      { creatorCount: FLOOR.creators, scriptCount: FLOOR.scripts, rating: 4.8 },
      { headers: { 'Cache-Control': 's-maxage=60' } },
    );
  }
}

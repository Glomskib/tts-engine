import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getQueuedJobs } from '@/lib/marketplace/queries';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sort = (req.nextUrl.searchParams.get('sort') || 'newest') as 'newest' | 'due_soon' | 'priority';
  try {
    const jobs = await getQueuedJobs({ sort });
    return NextResponse.json({ jobs });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

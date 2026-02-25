import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getQueuedJobs, getMpProfile, MarketplaceError } from '@/lib/marketplace/queries';
import type { VaBoardFilters } from '@/lib/marketplace/queries';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getMpProfile(user.id);
  if (!profile || !['va_editor', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const filters: VaBoardFilters = {
    sort: (sp.get('sort') || 'priority') as VaBoardFilters['sort'],
    status: (sp.get('status') || 'all') as VaBoardFilters['status'],
    search: sp.get('search') || undefined,
    userId: user.id,
  };

  try {
    const jobs = await getQueuedJobs(filters);
    return NextResponse.json({ jobs });
  } catch (e: unknown) {
    if (e instanceof MarketplaceError) {
      return NextResponse.json(
        { error: e.message, error_code: e.code },
        { status: e.httpStatus },
      );
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * GET /api/editor/jobs/[id] — job detail for polling.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('edit_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ job: data });
}

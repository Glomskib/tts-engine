/**
 * Client Video Requests List API
 * List all video editing requests for the authenticated client.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET: List all video requests for the authenticated client
 */
export async function GET(request: Request) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabaseAdmin
    .from('video_requests')
    .select('*')
    .eq('user_id', authContext.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch video requests:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch requests' }, { status: 500 });
  }

  // Count by status
  const stats = {
    total: data?.length || 0,
    pending: data?.filter(r => r.status === 'pending').length || 0,
    in_progress: data?.filter(r => ['assigned', 'in_progress', 'revision'].includes(r.status)).length || 0,
    review: data?.filter(r => r.status === 'review').length || 0,
    completed: data?.filter(r => r.status === 'completed').length || 0,
  };

  return NextResponse.json({ ok: true, data, stats });
}

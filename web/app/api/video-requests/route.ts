/**
 * Video Requests API
 * Handles video editing requests for subscription-based video clients.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isVideoClient, getVideosRemaining, deductVideo } from '@/lib/subscriptions';

/**
 * GET: List user's video requests
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

  // Get subscription info
  const videosRemaining = await getVideosRemaining(authContext.user.id);

  return NextResponse.json({
    ok: true,
    data: {
      requests: data,
      videosRemaining,
    },
  });
}

/**
 * POST: Create new video request
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Verify user is a video client
  const isClient = await isVideoClient(authContext.user.id);
  if (!isClient && !authContext.isAdmin) {
    return NextResponse.json({
      ok: false,
      error: 'Video requests are only available for video editing subscribers',
      upgrade: true,
    }, { status: 403 });
  }

  // Check video quota
  const videosRemaining = await getVideosRemaining(authContext.user.id);
  if (videosRemaining <= 0 && !authContext.isAdmin) {
    return NextResponse.json({
      ok: false,
      error: 'No videos remaining this month. Please upgrade your plan or wait until next billing cycle.',
      videosRemaining: 0,
    }, { status: 403 });
  }

  // Parse body
  const body = await request.json();
  const { title, description, source_drive_link, script_id, priority, due_date, content_type } = body;

  // Validate
  if (!title?.trim()) {
    return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 });
  }
  if (!source_drive_link?.trim()) {
    return NextResponse.json({ ok: false, error: 'Source drive link is required' }, { status: 400 });
  }

  // Validate content_type
  const validContentTypes = ['scripted', 'freestyle', 'existing'];
  const finalContentType = validContentTypes.includes(content_type) ? content_type : 'scripted';

  // Create request
  const { data: newRequest, error } = await supabaseAdmin
    .from('video_requests')
    .insert({
      user_id: authContext.user.id,
      title: title.trim(),
      description: description?.trim() || null,
      source_drive_link: source_drive_link.trim(),
      script_id: finalContentType === 'scripted' && script_id ? script_id : null,
      content_type: finalContentType,
      priority: priority || 0,
      due_date: due_date || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create video request:', error);
    return NextResponse.json({ ok: false, error: 'Failed to create request' }, { status: 500 });
  }

  // Deduct video from quota (admins bypass)
  if (!authContext.isAdmin) {
    const deductResult = await deductVideo(authContext.user.id);
    if (!deductResult.success) {
      // Rollback the request
      await supabaseAdmin.from('video_requests').delete().eq('id', newRequest.id);
      return NextResponse.json({
        ok: false,
        error: deductResult.error || 'Failed to deduct video quota',
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    data: newRequest,
    videosRemaining: videosRemaining - 1,
  });
}

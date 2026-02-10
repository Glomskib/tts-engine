/**
 * GET /api/admin/editors/[id]/videos
 * List videos assigned to a specific editor.
 *
 * DELETE /api/admin/editors/[id]/videos
 * Unassign a specific video from this editor (body: { video_id }).
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    // Get videos assigned to this editor
    const { data: videos, error } = await supabaseAdmin
      .from('videos')
      .select('id, video_code, title, recording_status, product_id')
      .eq('assigned_to', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch product + brand info for videos that have product_id
    const productIds = [...new Set((videos ?? []).map(v => v.product_id).filter(Boolean))] as string[];
    const productMap: Record<string, { name: string; brand: string | null }> = {};

    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name, brand')
        .in('id', productIds);

      products?.forEach(p => {
        productMap[p.id] = { name: p.name, brand: p.brand };
      });
    }

    const formattedVideos = (videos ?? []).map(v => ({
      id: v.id,
      video_code: v.video_code,
      title: v.title,
      recording_status: v.recording_status,
      product_name: v.product_id ? productMap[v.product_id]?.name : undefined,
      brand_name: v.product_id ? productMap[v.product_id]?.brand : undefined,
    }));

    return NextResponse.json({ videos: formattedVideos });
  } catch (error) {
    console.error('Error fetching editor videos:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const videoId = typeof body.video_id === 'string' ? body.video_id : '';
  if (!videoId) {
    return NextResponse.json({ error: 'video_id required' }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin
      .from('videos')
      .update({ assigned_to: null, assignment_state: 'UNASSIGNED' })
      .eq('id', videoId)
      .eq('assigned_to', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error unassigning video:', error);
    return NextResponse.json({ error: 'Failed to unassign video' }, { status: 500 });
  }
}

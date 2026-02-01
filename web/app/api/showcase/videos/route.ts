// GET /api/showcase/videos - Public showcase videos
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const featured = searchParams.get('featured');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    let query = supabaseAdmin
      .from('showcase_videos')
      .select('*')
      .eq('is_public', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch showcase videos:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch videos' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      videos: data || [],
      count: data?.length || 0,
    });
  } catch (err) {
    console.error('Showcase videos error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

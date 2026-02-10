import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

const TIKTOK_URL_PATTERN = /^https?:\/\/(www\.|vm\.)?tiktok\.com\//;

export async function GET(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }

  if (!TIKTOK_URL_PATTERN.test(url)) {
    return NextResponse.json({ error: 'Invalid TikTok URL' }, { status: 400 });
  }

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'TikTok API error' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('TikTok oEmbed error:', error);
    return NextResponse.json({ error: 'Failed to fetch video data' }, { status: 502 });
  }
}

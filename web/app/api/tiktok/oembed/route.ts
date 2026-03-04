import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

const TIKTOK_URL_PATTERN = /^https?:\/\/(www\.|vm\.)?tiktok\.com\//;

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return createApiErrorResponse('BAD_REQUEST', 'URL required', 400, correlationId);
  }

  if (!TIKTOK_URL_PATTERN.test(url)) {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid TikTok URL', 400, correlationId);
  }

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return createApiErrorResponse('INTERNAL', 'TikTok API error', response.status, correlationId);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('TikTok oEmbed error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to fetch video data', 502, correlationId);
  }
}

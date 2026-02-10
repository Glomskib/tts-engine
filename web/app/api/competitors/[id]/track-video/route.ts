import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

export const runtime = 'nodejs';

const TrackVideoSchema = z.object({
  tiktok_url: z.string().url(),
  title: z.string().max(500).optional(),
  hook_text: z.string().max(500).optional(),
  content_type: z.string().max(100).optional(),
  views: z.number().int().min(0).default(0),
  likes: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const { id } = await params;
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    // Verify competitor belongs to user
    const { data: competitor } = await supabaseAdmin
      .from('competitors')
      .select('id')
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .single();

    if (!competitor) {
      return createApiErrorResponse('NOT_FOUND', 'Competitor not found', 404, correlationId);
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
    }

    const parsed = TrackVideoSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, { issues: parsed.error.issues });
    }

    // Try fetching oEmbed metadata if title not provided
    let title = parsed.data.title;
    let hookText = parsed.data.hook_text;
    if (!title) {
      try {
        const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.data.tiktok_url)}`);
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          title = oembed.title;
          if (!hookText && oembed.title) {
            // Extract first sentence as hook
            const cleaned = oembed.title.replace(/#\w+/g, '').trim();
            const end = cleaned.search(/[.!?]\s/);
            hookText = end > 0 && end < 120 ? cleaned.substring(0, end + 1).trim() : cleaned.substring(0, 120);
          }
        }
      } catch { /* ignore oEmbed errors */ }
    }

    const { data, error } = await supabaseAdmin
      .from('competitor_videos')
      .insert({
        competitor_id: id,
        tiktok_url: parsed.data.tiktok_url,
        title: title || null,
        hook_text: hookText || null,
        content_type: parsed.data.content_type || null,
        views: parsed.data.views,
        likes: parsed.data.likes,
        comments: parsed.data.comments,
        shares: parsed.data.shares,
      })
      .select()
      .single();

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    // Update last_checked_at on competitor
    await supabaseAdmin
      .from('competitors')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(
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

    const { data: competitor } = await supabaseAdmin
      .from('competitors')
      .select('*')
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .single();

    if (!competitor) {
      return createApiErrorResponse('NOT_FOUND', 'Competitor not found', 404, correlationId);
    }

    const { data: videos } = await supabaseAdmin
      .from('competitor_videos')
      .select('*')
      .eq('competitor_id', id)
      .order('views', { ascending: false })
      .limit(20);

    if (!videos || videos.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          competitor: competitor.name,
          summary: 'No videos tracked yet. Add competitor videos to get an analysis.',
          top_hooks: [],
          recommendations: [],
        },
        correlation_id: correlationId,
      });
    }

    const videoSummaries = videos.map((v: any, i: number) =>
      `${i + 1}. "${v.title || 'No title'}" - Hook: "${v.hook_text || 'N/A'}" | Views: ${v.views} | Likes: ${v.likes} | Comments: ${v.comments} | Type: ${v.content_type || 'unknown'}`
    ).join('\n');

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return createApiErrorResponse('BAD_REQUEST', 'Anthropic API key not configured', 500, correlationId);
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyze this TikTok competitor's content strategy. Competitor: ${competitor.name} (@${competitor.tiktok_handle}), Category: ${competitor.category || 'General'}.

Their top videos:
${videoSummaries}

Provide a JSON response with:
{
  "summary": "2-3 sentence overview of their strategy",
  "top_hooks": ["their best hook patterns"],
  "content_patterns": ["recurring content themes"],
  "posting_style": "description of their style",
  "weaknesses": ["gaps you could exploit"],
  "recommendations": ["3 specific actions to compete with them"],
  "remix_ideas": ["2 ideas for remixing their top content"]
}

Return ONLY the JSON, no markdown.`,
        }],
      }),
    });

    const aiData = await aiRes.json();
    const text = aiData?.content?.[0]?.text || '';

    let analysis: any = {};
    try {
      analysis = JSON.parse(text);
    } catch {
      analysis = { summary: text || 'Analysis failed', top_hooks: [], content_patterns: [], recommendations: [] };
    }

    return NextResponse.json({
      ok: true,
      data: {
        competitor: competitor.name,
        handle: competitor.tiktok_handle,
        videos_analyzed: videos.length,
        ...analysis,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Competitor analysis error:`, err);
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

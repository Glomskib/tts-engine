import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/competitors/analyze
 * AI-powered competitive intelligence: compares a competitor's patterns
 * against the creator's own DNA/winners to produce actionable recommendations.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const competitorId = body.competitor_id;
    if (!competitorId) {
      return createApiErrorResponse('BAD_REQUEST', 'competitor_id is required', 400, correlationId);
    }

    // 1. Load competitor + their tracked videos
    const { data: competitor } = await supabaseAdmin
      .from('competitors')
      .select('*')
      .eq('id', competitorId)
      .eq('user_id', authContext.user.id)
      .single();

    if (!competitor) {
      return createApiErrorResponse('NOT_FOUND', 'Competitor not found', 404, correlationId);
    }

    const { data: compVideos } = await supabaseAdmin
      .from('competitor_videos')
      .select('*')
      .eq('competitor_id', competitorId)
      .order('views', { ascending: false })
      .limit(30);

    // 2. Load creator's own data: DNA profile + recent winners
    const { data: creatorDna } = await supabaseAdmin
      .from('creator_dna')
      .select('*')
      .eq('user_id', authContext.user.id)
      .single();

    const { data: myWinners } = await supabaseAdmin
      .from('winners')
      .select('title, hook_text, views, likes, engagement_rate, content_type, tags')
      .eq('user_id', authContext.user.id)
      .order('views', { ascending: false })
      .limit(20);

    // 3. Build context strings
    const compVideoSummary = (compVideos || []).map((v: any, i: number) =>
      `${i + 1}. "${v.title || 'Untitled'}" — Hook: "${v.hook_text || 'N/A'}" | Views: ${v.views?.toLocaleString()} | Likes: ${v.likes} | Comments: ${v.comments} | Type: ${v.content_type || 'unknown'}`
    ).join('\n');

    const myWinnerSummary = (myWinners || []).map((w: any, i: number) =>
      `${i + 1}. "${w.title || 'Untitled'}" — Hook: "${w.hook_text || 'N/A'}" | Views: ${w.views?.toLocaleString()} | Likes: ${w.likes} | Engagement: ${w.engagement_rate || 'N/A'}%`
    ).join('\n');

    // Compute basic stats
    const compStats = computeStats(compVideos || []);
    const myStats = computeWinnerStats(myWinners || []);

    const dnaContext = creatorDna ? `
Creator DNA Profile:
- Top hooks: ${creatorDna.top_hook_types || 'Unknown'}
- Best formats: ${creatorDna.best_formats || 'Unknown'}
- Strengths: ${creatorDna.strengths || 'Unknown'}
- Style: ${creatorDna.content_style || 'Unknown'}
- Avg engagement: ${creatorDna.avg_engagement || 'Unknown'}%
` : 'No Creator DNA profile available — use the winner data below instead.';

    // 4. Call Claude for competitive intelligence
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return createApiErrorResponse('BAD_REQUEST', 'Anthropic API key not configured', 500, correlationId);
    }

    const prompt = `Compare these two TikTok creators and provide actionable competitive intelligence.

MY CREATOR:
${dnaContext}
My top performing videos:
${myWinnerSummary || 'No winner data available yet.'}
My stats: Avg views: ${myStats.avgViews.toLocaleString()}, Avg engagement: ${myStats.avgEngagement.toFixed(1)}%, Total winners: ${myWinners?.length || 0}

COMPETITOR: ${competitor.name} (@${competitor.tiktok_handle}), Category: ${competitor.category || 'General'}
Their tracked videos:
${compVideoSummary || 'No videos tracked yet.'}
Their stats: Avg views: ${compStats.avgViews.toLocaleString()}, Avg engagement: ${compStats.avgEngagement.toFixed(1)}%, Videos tracked: ${compVideos?.length || 0}

Return ONLY valid JSON with this exact structure:
{
  "comparison": {
    "engagement": {"mine": ${myStats.avgEngagement.toFixed(1)}, "theirs": ${compStats.avgEngagement.toFixed(1)}, "verdict": "You're ahead/behind by X%"},
    "avg_views": {"mine": ${myStats.avgViews}, "theirs": ${compStats.avgViews}, "verdict": "..."},
    "content_diversity": {"mine": "description of my content range", "theirs": "description of their range", "verdict": "..."}
  },
  "steal_worthy": [
    {"what": "Their hook style where they...", "how_to_adapt": "Try this with your voice by...", "example_hook": "Actual hook text you could use"}
  ],
  "your_advantages": [
    {"what": "Your strength they don't have", "how_to_leverage": "Double down on..."}
  ],
  "gaps_to_fill": [
    {"gap": "They cover X topic you don't", "opportunity": "You could..."}
  ],
  "tactical_plan": "2-3 sentences on what to do this week based on this comparison"
}

Return ONLY the JSON, no markdown fences or extra text.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const text = aiData?.content?.[0]?.text || '';

    let analysis: any = {};
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        comparison: {},
        steal_worthy: [],
        your_advantages: [],
        gaps_to_fill: [],
        tactical_plan: text || 'Analysis could not be parsed.',
      };
    }

    return NextResponse.json({
      ok: true,
      data: {
        competitor_name: competitor.name,
        competitor_handle: competitor.tiktok_handle,
        my_stats: myStats,
        competitor_stats: compStats,
        ...analysis,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Competitor DNA comparison error:`, err);
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

function computeStats(videos: any[]) {
  if (videos.length === 0) return { avgViews: 0, avgEngagement: 0, totalVideos: 0 };
  const avgViews = Math.round(videos.reduce((s, v) => s + (v.views || 0), 0) / videos.length);
  const avgEngagement = videos.reduce((s, v) => s + (v.engagement_rate || 0), 0) / videos.length;
  return { avgViews, avgEngagement, totalVideos: videos.length };
}

function computeWinnerStats(winners: any[]) {
  if (winners.length === 0) return { avgViews: 0, avgEngagement: 0, totalWinners: 0 };
  const avgViews = Math.round(winners.reduce((s, w) => s + (w.views || 0), 0) / winners.length);
  const avgEngagement = winners.reduce((s, w) => s + (Number(w.engagement_rate) || 0), 0) / winners.length;
  return { avgViews, avgEngagement, totalWinners: winners.length };
}

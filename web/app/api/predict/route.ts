import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface PredictionInput {
  script_text?: string;
  hook?: string;
  product_id?: string;
  brand?: string;
  content_type?: string;
}

interface PredictionOutput {
  predicted_views: { low: number; mid: number; high: number };
  predicted_engagement: number; // percentage
  viral_potential: 'low' | 'medium' | 'high';
  hook_strength: number; // 1-10
  content_score: number; // 1-100
  suggestions: string[];
  confidence: number; // 0-1
}

/**
 * POST /api/predict
 * Predict content performance based on script analysis and historical data
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: PredictionInput;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.script_text && !body.hook) {
    return createApiErrorResponse('BAD_REQUEST', 'script_text or hook is required', 400, correlationId);
  }

  // Fetch historical performance data for calibration
  const { data: historicalVideos } = await supabaseAdmin
    .from('videos')
    .select('tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, recording_status')
    .eq('recording_status', 'POSTED')
    .not('tiktok_views', 'is', null)
    .gt('tiktok_views', 0)
    .order('created_at', { ascending: false })
    .limit(100);

  // Calculate historical averages for calibration
  const stats = (historicalVideos || []).map(v => ({
    views: v.tiktok_views || 0,
    likes: v.tiktok_likes || 0,
    comments: v.tiktok_comments || 0,
    shares: v.tiktok_shares || 0,
    engagement: v.tiktok_views > 0 ? ((v.tiktok_likes || 0) / v.tiktok_views) * 100 : 0,
  }));

  const avgViews = stats.length > 0 ? stats.reduce((s, v) => s + v.views, 0) / stats.length : 5000;
  const avgEngagement = stats.length > 0 ? stats.reduce((s, v) => s + v.engagement, 0) / stats.length : 3;
  const maxViews = stats.length > 0 ? Math.max(...stats.map(v => v.views)) : 50000;

  // Brand-specific performance if available
  let brandMultiplier = 1;
  if (body.product_id) {
    const { data: brandVideos } = await supabaseAdmin
      .from('videos')
      .select('tiktok_views')
      .eq('product_id', body.product_id)
      .eq('recording_status', 'POSTED')
      .not('tiktok_views', 'is', null)
      .gt('tiktok_views', 0)
      .limit(20);

    if (brandVideos && brandVideos.length >= 3) {
      const brandAvg = brandVideos.reduce((s, v) => s + (v.tiktok_views || 0), 0) / brandVideos.length;
      brandMultiplier = brandAvg / Math.max(avgViews, 1);
    }
  }

  // Heuristic scoring based on content analysis
  const text = body.script_text || body.hook || '';
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hook = body.hook || text.split('\n')[0] || '';

  // Hook analysis
  let hookScore = 5;
  if (hook.length > 0 && hook.length <= 60) hookScore += 2; // Concise hooks perform better
  if (/\?/.test(hook)) hookScore += 1; // Questions engage
  if (/!/.test(hook)) hookScore += 0.5; // Excitement
  if (/you|your/i.test(hook)) hookScore += 1; // Direct address
  if (/stop|wait|don't|never|secret|hack|mistake/i.test(hook)) hookScore += 1; // Pattern interrupt
  hookScore = Math.min(10, Math.max(1, Math.round(hookScore)));

  // Content analysis
  let contentScore = 50;
  if (wordCount >= 50 && wordCount <= 200) contentScore += 15; // Optimal length
  else if (wordCount < 50) contentScore -= 10; // Too short
  else contentScore -= 5; // Long but not terrible

  if (/cta|link|bio|shop|buy|click/i.test(text)) contentScore += 10; // Has CTA
  if (/before.*after|vs|compare/i.test(text)) contentScore += 5; // Comparison format
  if (/step\s*\d|first|then|finally/i.test(text)) contentScore += 5; // Structured
  if (/😂|🔥|💪|🤯|😱/u.test(text)) contentScore += 3; // Emojis

  contentScore = Math.min(100, Math.max(10, contentScore));

  // Viral potential
  const viralScore = (hookScore / 10) * 0.4 + (contentScore / 100) * 0.4 + (brandMultiplier > 1.5 ? 0.2 : brandMultiplier > 0.8 ? 0.1 : 0);
  const viralPotential: PredictionOutput['viral_potential'] =
    viralScore >= 0.7 ? 'high' :
    viralScore >= 0.4 ? 'medium' : 'low';

  // View predictions calibrated to historical data
  const baseViews = avgViews * brandMultiplier * (contentScore / 70);
  const predicted_views = {
    low: Math.round(baseViews * 0.3),
    mid: Math.round(baseViews),
    high: Math.round(Math.min(baseViews * 3, maxViews * 1.2)),
  };

  // Engagement prediction
  const predicted_engagement = Math.round(
    (avgEngagement * (hookScore / 7) * (contentScore / 60)) * 10
  ) / 10;

  // Suggestions
  const suggestions: string[] = [];
  if (hookScore < 6) suggestions.push('Strengthen your hook — try a question or pattern interrupt');
  if (wordCount < 50) suggestions.push('Script is very short — consider adding more detail or examples');
  if (wordCount > 200) suggestions.push('Script may be too long for TikTok — consider trimming to under 150 words');
  if (!/you|your/i.test(hook)) suggestions.push('Address the viewer directly in your hook ("You" or "Your")');
  if (!/cta|link|bio|shop|buy|click/i.test(text)) suggestions.push('Add a clear call-to-action');
  if (hookScore >= 8 && contentScore >= 70) suggestions.push('Strong content — consider A/B testing different hooks');

  const confidence = Math.min(0.95, 0.3 + (stats.length / 100) * 0.5 + (brandMultiplier !== 1 ? 0.15 : 0));

  const prediction: PredictionOutput = {
    predicted_views,
    predicted_engagement,
    viral_potential: viralPotential,
    hook_strength: hookScore,
    content_score: contentScore,
    suggestions,
    confidence: Math.round(confidence * 100) / 100,
  };

  return NextResponse.json({
    ok: true,
    data: prediction,
    meta: {
      historical_videos_analyzed: stats.length,
      avg_views: Math.round(avgViews),
      avg_engagement: Math.round(avgEngagement * 10) / 10,
      brand_multiplier: Math.round(brandMultiplier * 100) / 100,
    },
    correlation_id: correlationId,
  });
}

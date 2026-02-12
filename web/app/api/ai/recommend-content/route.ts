import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface Recommendation {
  id: string;
  title: string;
  description: string;
  type: 'gap_fill' | 'winner_remix' | 'trending_hook' | 'underserved_product' | 'content_type_diversify';
  priority: number; // 1-10
  product_id?: string;
  product_name?: string;
  content_type?: string;
  hook_suggestion?: string;
  studio_params: Record<string, string>;
}

/**
 * GET /api/ai/recommend-content — AI-powered content recommendations
 * Analyzes winners, pipeline gaps, and product coverage to suggest what to create next.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const recommendations: Recommendation[] = [];

    // 1. Fetch winners (top performers for pattern analysis)
    const { data: winners } = await supabaseAdmin
      .from('winners_bank')
      .select('id, hook, hook_type, content_format, product_category, view_count, engagement_rate, performance_score, patterns, video_url')
      .eq('is_active', true)
      .order('performance_score', { ascending: false })
      .limit(50);

    // 2. Fetch all products
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, brand, category, pain_points');

    // 3. Fetch pipeline videos (to find gaps)
    const { data: pipelineVideos } = await supabaseAdmin
      .from('videos')
      .select('id, product_id, status, scheduled_date, created_at')
      .not('status', 'eq', 'ARCHIVED');

    // 4. Fetch recent scripts to know what's already been generated
    const { data: recentScripts } = await supabaseAdmin
      .from('saved_skits')
      .select('id, product_id, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    const allProducts = products || [];
    const allWinners = winners || [];
    const allPipeline = pipelineVideos || [];
    const allScripts = recentScripts || [];

    // --- Analysis ---

    // A) Find products with NO content in pipeline or recent scripts
    const productsWithContent = new Set<string>();
    for (const v of allPipeline) {
      if (v.product_id) productsWithContent.add(v.product_id);
    }
    for (const s of allScripts) {
      if (s.product_id) productsWithContent.add(s.product_id);
    }

    const underservedProducts = allProducts.filter(p => !productsWithContent.has(p.id));
    for (const product of underservedProducts.slice(0, 3)) {
      const painPoints = Array.isArray(product.pain_points) ? product.pain_points : [];
      const topPain = painPoints[0];
      const painText = topPain?.point || topPain?.hook_angle || '';

      recommendations.push({
        id: `gap-${product.id}`,
        title: `Create content for ${product.name}`,
        description: `${product.name} has no videos in the pipeline or recent scripts.${painText ? ` Try targeting: "${painText}"` : ''} Start with a UGC testimonial or problem/solution script.`,
        type: 'underserved_product',
        priority: 9,
        product_id: product.id,
        product_name: product.name,
        content_type: 'ugc_testimonial',
        studio_params: { product: product.id, type: 'tof' },
      });
    }

    // B) Winner remix suggestions — take top winners and suggest new variations
    const topWinners = allWinners.filter(w => (w.performance_score || 0) >= 7).slice(0, 5);
    for (const winner of topWinners.slice(0, 2)) {
      const hookPreview = winner.hook ? (winner.hook.length > 60 ? winner.hook.slice(0, 60) + '...' : winner.hook) : 'high-performing hook';
      recommendations.push({
        id: `remix-${winner.id}`,
        title: `Remix winner: "${hookPreview}"`,
        description: `This ${winner.content_format || 'video'} scored ${winner.performance_score}/10 with ${(winner.view_count || 0).toLocaleString()} views. Create a fresh variation with a similar hook pattern.`,
        type: 'winner_remix',
        priority: 8,
        hook_suggestion: winner.hook || undefined,
        content_type: winner.content_format || undefined,
        studio_params: { type: 'skit' },
      });
    }

    // C) Trending hook type analysis — find which hook types perform best
    const hookTypeStats: Record<string, { count: number; totalScore: number; totalViews: number }> = {};
    for (const w of allWinners) {
      const ht = w.hook_type || 'unknown';
      if (!hookTypeStats[ht]) hookTypeStats[ht] = { count: 0, totalScore: 0, totalViews: 0 };
      hookTypeStats[ht].count++;
      hookTypeStats[ht].totalScore += w.performance_score || 0;
      hookTypeStats[ht].totalViews += w.view_count || 0;
    }

    const sortedHookTypes = Object.entries(hookTypeStats)
      .map(([type, stats]) => ({ type, avgScore: stats.totalScore / stats.count, totalViews: stats.totalViews, count: stats.count }))
      .filter(h => h.count >= 2)
      .sort((a, b) => b.avgScore - a.avgScore);

    if (sortedHookTypes.length > 0) {
      const bestHookType = sortedHookTypes[0];
      // Find a product that hasn't used this hook type recently
      const randomProduct = allProducts[Math.floor(Math.random() * allProducts.length)];
      if (randomProduct) {
        recommendations.push({
          id: `hook-${bestHookType.type}`,
          title: `Use "${bestHookType.type}" hook for ${randomProduct.name}`,
          description: `"${bestHookType.type}" hooks average ${bestHookType.avgScore.toFixed(1)}/10 in your winners bank across ${bestHookType.count} videos. Try this pattern for ${randomProduct.name}.`,
          type: 'trending_hook',
          priority: 7,
          product_id: randomProduct.id,
          product_name: randomProduct.name,
          hook_suggestion: bestHookType.type,
          studio_params: { product: randomProduct.id, type: 'skit' },
        });
      }
    }

    // D) Content type diversification
    const contentTypeCounts: Record<string, number> = {};
    for (const w of allWinners) {
      const ct = w.content_format || 'unknown';
      contentTypeCounts[ct] = (contentTypeCounts[ct] || 0) + 1;
    }

    const allContentTypes = ['skit', 'story', 'tutorial', 'comparison', 'testimonial', 'unboxing', 'day_in_life'];
    const unusedTypes = allContentTypes.filter(t => !contentTypeCounts[t]);
    if (unusedTypes.length > 0 && allProducts.length > 0) {
      const suggestedType = unusedTypes[0];
      const randomProduct = allProducts[Math.floor(Math.random() * allProducts.length)];
      recommendations.push({
        id: `diversify-${suggestedType}`,
        title: `Try a ${suggestedType} format`,
        description: `You haven't used "${suggestedType}" format in your winners bank yet. Diversifying content formats can help reach different audience segments. Try it for ${randomProduct.name}.`,
        type: 'content_type_diversify',
        priority: 5,
        product_id: randomProduct.id,
        product_name: randomProduct.name,
        content_type: suggestedType,
        studio_params: { product: randomProduct.id, type: 'tof' },
      });
    }

    // E) Products with no scheduled content this week
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    const scheduledProductIds = new Set(
      allPipeline
        .filter(v => v.scheduled_date && new Date(v.scheduled_date) <= endOfWeek && new Date(v.scheduled_date) >= now)
        .map(v => v.product_id)
        .filter(Boolean)
    );

    const unscheduledProducts = allProducts.filter(p => !scheduledProductIds.has(p.id) && productsWithContent.has(p.id));
    for (const product of unscheduledProducts.slice(0, 2)) {
      recommendations.push({
        id: `schedule-${product.id}`,
        title: `Schedule content for ${product.name}`,
        description: `${product.name} has content but nothing scheduled this week. Generate a fresh script to keep the posting cadence.`,
        type: 'gap_fill',
        priority: 6,
        product_id: product.id,
        product_name: product.name,
        studio_params: { product: product.id, type: 'tof' },
      });
    }

    // Sort by priority (highest first) and limit to 10
    recommendations.sort((a, b) => b.priority - a.priority);
    const topRecommendations = recommendations.slice(0, 10);

    return NextResponse.json({
      ok: true,
      data: {
        recommendations: topRecommendations,
        meta: {
          total_winners: allWinners.length,
          total_products: allProducts.length,
          pipeline_count: allPipeline.length,
          top_hook_type: sortedHookTypes[0]?.type || null,
          underserved_count: underservedProducts.length,
        },
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Recommend content error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

import { NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { fetchWinners, type Winner } from '@/lib/winners';

export const runtime = 'nodejs';

/**
 * GET /api/winners/intelligence
 * Returns aggregated intelligence from winners for display in the generator
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Fetch all active winners for the user
  const { winners, error } = await fetchWinners(authContext.user.id, {
    sort: 'performance_score',
    limit: 100,
  });

  if (error) {
    console.error(`[${correlationId}] Failed to fetch winners:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch winners', 500, correlationId);
  }

  if (winners.length === 0) {
    const response = NextResponse.json({
      ok: true,
      hasData: false,
      message: 'No winners in bank yet',
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  // Aggregate intelligence data
  const intelligence = aggregateIntelligence(winners);

  const response = NextResponse.json({
    ok: true,
    hasData: true,
    intelligence,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

interface WinnersIntelligenceSummary {
  totalWinners: number;
  generated: number;
  external: number;

  // Metrics
  avgViews: number;
  avgEngagement: number;
  totalViews: number;

  // Top patterns
  topHookTypes: Array<{ type: string; count: number; avgEngagement: number }>;
  topContentFormats: Array<{ format: string; count: number; avgEngagement: number }>;

  // Common patterns from AI analysis
  commonPatterns: string[];
  patternsToAvoid: string[];

  // Top performing hooks
  topHooks: Array<{ text: string; views: number; engagement: number }>;
}

function aggregateIntelligence(winners: Winner[]): WinnersIntelligenceSummary {
  const generated = winners.filter(w => w.source_type === 'generated');
  const external = winners.filter(w => w.source_type === 'external');

  // Calculate averages
  const viewsData = winners.filter(w => w.view_count && w.view_count > 0).map(w => w.view_count!);
  const engagementData = winners.filter(w => w.engagement_rate && w.engagement_rate > 0).map(w => w.engagement_rate!);

  const avgViews = viewsData.length > 0
    ? Math.round(viewsData.reduce((a, b) => a + b, 0) / viewsData.length)
    : 0;
  const avgEngagement = engagementData.length > 0
    ? parseFloat((engagementData.reduce((a, b) => a + b, 0) / engagementData.length).toFixed(2))
    : 0;
  const totalViews = viewsData.reduce((a, b) => a + b, 0);

  // Aggregate hook types
  const hookTypeCounts = new Map<string, { count: number; totalEngagement: number }>();
  winners.forEach(w => {
    if (w.hook_type) {
      const current = hookTypeCounts.get(w.hook_type) || { count: 0, totalEngagement: 0 };
      hookTypeCounts.set(w.hook_type, {
        count: current.count + 1,
        totalEngagement: current.totalEngagement + (w.engagement_rate || 0),
      });
    }
  });
  const topHookTypes = Array.from(hookTypeCounts.entries())
    .map(([type, data]) => ({
      type: type.replace('_', ' '),
      count: data.count,
      avgEngagement: parseFloat((data.totalEngagement / data.count).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Aggregate content formats
  const formatCounts = new Map<string, { count: number; totalEngagement: number }>();
  winners.forEach(w => {
    if (w.content_format) {
      const current = formatCounts.get(w.content_format) || { count: 0, totalEngagement: 0 };
      formatCounts.set(w.content_format, {
        count: current.count + 1,
        totalEngagement: current.totalEngagement + (w.engagement_rate || 0),
      });
    }
  });
  const topContentFormats = Array.from(formatCounts.entries())
    .map(([format, data]) => ({
      format: format.replace('_', ' '),
      count: data.count,
      avgEngagement: parseFloat((data.totalEngagement / data.count).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Extract common patterns from AI analysis
  const allPatterns: string[] = [];
  const allAvoid: string[] = [];
  winners.forEach(w => {
    if (w.ai_analysis?.patterns?.hook_pattern) {
      allPatterns.push(w.ai_analysis.patterns.hook_pattern);
    }
    if (w.ai_analysis?.patterns?.content_pattern) {
      allPatterns.push(w.ai_analysis.patterns.content_pattern);
    }
    if (w.ai_analysis?.avoid) {
      allAvoid.push(...w.ai_analysis.avoid);
    }
  });

  // Deduplicate and limit patterns
  const commonPatterns = [...new Set(allPatterns)].slice(0, 5);
  const patternsToAvoid = [...new Set(allAvoid)].slice(0, 3);

  // Top performing hooks
  const topHooks = winners
    .filter(w => w.hook && w.view_count && w.view_count > 0)
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, 5)
    .map(w => ({
      text: w.hook!.substring(0, 80) + (w.hook!.length > 80 ? '...' : ''),
      views: w.view_count!,
      engagement: w.engagement_rate || 0,
    }));

  return {
    totalWinners: winners.length,
    generated: generated.length,
    external: external.length,
    avgViews,
    avgEngagement,
    totalViews,
    topHookTypes,
    topContentFormats,
    commonPatterns,
    patternsToAvoid,
    topHooks,
  };
}

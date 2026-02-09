import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import {
  analyzeWinnerWithAI,
  extractPatternsFromAnalysis,
  updateWinnerAnalysis,
  type Winner,
} from '@/lib/winners';

export const runtime = 'nodejs';

/**
 * POST /api/winners/[id]/analyze
 * Trigger AI analysis for a winner
 *
 * This endpoint is designed to be called asynchronously (fire-and-forget)
 * after a winner is created, but can also be called manually to re-analyze.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  // Fetch the winner directly (no auth check since this is internal/async)
  const { data: winner, error: fetchError } = await supabaseAdmin
    .from('winners_bank')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !winner) {
    console.error(`[${correlationId}] Winner not found for analysis:`, id);
    return createApiErrorResponse('NOT_FOUND', 'Winner not found', 404, correlationId);
  }

  // Check if already analyzed recently (within 24 hours)
  // Use ai_analysis presence + updated_at as proxy since table has no ai_analyzed_at column
  if (winner.ai_analysis) {
    const updatedAt = new Date(winner.updated_at);
    const hoursSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceUpdate < 24) {
      const response = NextResponse.json({
        ok: true,
        message: 'Already analyzed recently',
        correlation_id: correlationId,
      });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }
  }

  // Run AI analysis
  const analysis = await analyzeWinnerWithAI(winner as Winner);

  if (!analysis) {
    console.error(`[${correlationId}] AI analysis failed for winner:`, id);
    return createApiErrorResponse(
      'AI_ERROR',
      'Failed to generate AI analysis',
      500,
      correlationId
    );
  }

  // Extract patterns for quick reference
  const extractedPatterns = extractPatternsFromAnalysis(analysis);

  // Save analysis to database (ai_analysis + extracted_patterns columns)
  const { success, error: updateError } = await updateWinnerAnalysis(
    id,
    analysis as unknown as Record<string, unknown>,
    extractedPatterns as unknown as Record<string, unknown>
  );

  if (!success || updateError) {
    console.error(`[${correlationId}] Failed to save analysis:`, updateError);
    return createApiErrorResponse('DB_ERROR', 'Failed to save analysis', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    message: 'Analysis completed',
    analysis,
    extracted_patterns: extractedPatterns,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * GET /api/winners/[id]/analyze
 * Get the current AI analysis for a winner
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const { data: winner, error } = await supabaseAdmin
    .from('winners_bank')
    .select('id, ai_analysis, extracted_patterns')
    .eq('id', id)
    .single();

  if (error || !winner) {
    return createApiErrorResponse('NOT_FOUND', 'Winner not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    winner_id: winner.id,
    ai_analysis: winner.ai_analysis,
    extracted_patterns: winner.extracted_patterns,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

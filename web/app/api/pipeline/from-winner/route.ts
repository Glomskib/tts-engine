import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchWinnerById } from '@/lib/winners';
import { z } from 'zod';

export const runtime = 'nodejs';

const FromWinnerSchema = z.object({
  winner_id: z.string().uuid(),
  transcript: z.string().optional(),
  product_id: z.string().uuid().optional(),
  priority: z.enum(['normal', 'high']).default('normal'),
});

/**
 * POST /api/pipeline/from-winner
 * Create a video pipeline entry from a winner record.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = FromWinnerSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { winner_id, transcript, product_id, priority } = parsed.data;

  try {
    // 1. Fetch winner
    const { winner, error: winnerError } = await fetchWinnerById(winner_id, authContext.user.id);

    if (winnerError || !winner) {
      return createApiErrorResponse('NOT_FOUND', 'Winner not found', 404, correlationId);
    }

    // 2. Build script from transcript or winner data
    const scriptContent = transcript || buildScriptFromWinner(winner);

    // 3. Generate video code
    const videoCode = `VID-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // 4. Determine product_id
    const resolvedProductId = product_id || await resolveProductFromWinner(winner);

    // 5. Create video entry
    const videoInsert: Record<string, unknown> = {
      video_code: videoCode,
      recording_status: 'SCRIPTED',
      script_draft: scriptContent,
      brief: {
        hook: winner.hook || 'No hook',
        notes: `Auto-generated from TikTok winner import`,
        source: 'winner_import',
        winner_id: winner.id,
        original_url: winner.video_url,
      },
      priority: priority === 'high' ? 80 : 50,
      source: 'winner_import',
      created_by: authContext.user.id,
    };

    if (resolvedProductId) {
      videoInsert.product_id = resolvedProductId;
    }

    const { data: video, error: videoError } = await supabaseAdmin
      .from('videos')
      .insert(videoInsert)
      .select('id, video_code, recording_status, priority, product_id')
      .single();

    if (videoError) {
      console.error(`[${correlationId}] Video creation error:`, videoError);
      return createApiErrorResponse('DB_ERROR', 'Failed to create pipeline entry', 500, correlationId);
    }

    // 6. Log event
    await supabaseAdmin.from('video_events').insert({
      video_id: video.id,
      event_type: 'created_from_winner',
      actor: authContext.user.id,
      details: {
        winner_id: winner.id,
        source_url: winner.video_url,
        hook: winner.hook,
      },
    });

    const response = NextResponse.json({
      ok: true,
      data: {
        video_id: video.id,
        video_code: video.video_code,
        status: video.recording_status,
        hook: winner.hook,
        product_id: resolvedProductId,
        winner_id: winner.id,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Pipeline from winner error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Failed to create pipeline entry',
      500,
      correlationId
    );
  }
}

/**
 * Build a script draft from winner data when no transcript is available.
 */
function buildScriptFromWinner(winner: { hook?: string | null; full_script?: string | null; notes?: string | null; video_url?: string | null }): string {
  const lines: string[] = [];

  lines.push('[HOOK]');
  lines.push(winner.hook || 'TBD - Review original video');
  lines.push('');

  if (winner.full_script) {
    lines.push('[SCRIPT]');
    lines.push(winner.full_script);
    lines.push('');
  }

  lines.push('[REFERENCE]');
  lines.push(`Original video: ${winner.video_url || 'N/A'}`);
  if (winner.notes) {
    lines.push(`Notes: ${winner.notes}`);
  }
  lines.push('');

  lines.push('[CTA]');
  lines.push('TBD - Add call to action');

  return lines.join('\n');
}

/**
 * Try to find a product linked to the winner via product_category.
 */
async function resolveProductFromWinner(winner: { product_category?: string | null }): Promise<string | null> {
  if (!winner.product_category) return null;

  const { data } = await supabaseAdmin
    .from('products')
    .select('id')
    .ilike('category', winner.product_category)
    .limit(1)
    .single();

  return data?.id || null;
}

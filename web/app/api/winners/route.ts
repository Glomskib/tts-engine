import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { z } from 'zod';
import {
  fetchWinners,
  createWinner,
  type CreateWinnerInput,
} from '@/lib/winners';

export const runtime = 'nodejs';

// Schema for creating a new winner
const CreateWinnerSchema = z.object({
  source_type: z.enum(['our_script', 'external']),
  script_id: z.string().uuid().optional(),
  skit_id: z.string().uuid().optional(),
  tiktok_url: z.string().url().optional(),
  video_title: z.string().max(255).optional(),
  thumbnail_url: z.string().url().optional(),
  posted_at: z.string().optional(),
  creator_handle: z.string().max(100).optional(),
  creator_niche: z.string().max(100).optional(),

  // Metrics
  views: z.number().int().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
  saves: z.number().int().min(0).optional(),

  // Retention
  avg_watch_time_seconds: z.number().min(0).optional(),
  avg_watch_time_percent: z.number().min(0).max(100).optional(),
  retention_3s: z.number().min(0).max(100).optional(),
  retention_half: z.number().min(0).max(100).optional(),
  retention_full: z.number().min(0).max(100).optional(),

  // Content
  product_name: z.string().max(255).optional(),
  product_category: z.string().max(100).optional(),
  hook_text: z.string().optional(),
  hook_type: z.string().max(50).optional(),
  content_format: z.string().max(50).optional(),
  video_length_seconds: z.number().int().min(0).optional(),

  // User insights
  user_notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/winners
 * List winners with optional filters
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const searchParams = request.nextUrl.searchParams;
  const sourceType = searchParams.get('source_type') as 'our_script' | 'external' | null;
  const category = searchParams.get('category') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const sort = (searchParams.get('sort') || 'performance_score') as 'performance_score' | 'views' | 'engagement' | 'recent';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const { winners, error } = await fetchWinners(authContext.user.id, {
    sourceType: sourceType || undefined,
    category,
    tag,
    sort,
    limit,
  });

  if (error) {
    console.error(`[${correlationId}] Failed to fetch winners:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch winners', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    winners,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * POST /api/winners
 * Add a new winner
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = CreateWinnerSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'Invalid input',
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  const input = parsed.data as CreateWinnerInput;

  // If linking to our script/skit, fetch hook_text automatically if not provided
  if (input.source_type === 'our_script' && !input.hook_text) {
    // Could fetch from script/skit here if needed
  }

  const { winner, error } = await createWinner(authContext.user.id, input);

  if (error) {
    console.error(`[${correlationId}] Failed to create winner:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to create winner', 500, correlationId);
  }

  // Trigger AI analysis asynchronously (don't block response)
  if (winner) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    if (appUrl) {
      fetch(`${appUrl}/api/winners/${winner.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(err => {
        console.error(`[${correlationId}] Failed to trigger analysis:`, err);
      });
    }
  }

  const response = NextResponse.json({
    ok: true,
    winner,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

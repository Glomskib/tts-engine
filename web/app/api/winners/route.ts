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

// Schema for creating a new winner — field names match winners_bank table
const CreateWinnerSchema = z.object({
  source_type: z.enum(['generated', 'external']),
  script_id: z.string().uuid().optional(),

  // Content
  hook: z.string().optional(),
  full_script: z.string().optional(),
  video_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  notes: z.string().optional(),

  // Categorization
  hook_type: z.string().max(50).optional(),
  content_format: z.string().max(50).optional(),
  product_category: z.string().max(100).optional(),

  // Metrics
  view_count: z.number().int().min(0).optional(),
  like_count: z.number().int().min(0).optional(),
  comment_count: z.number().int().min(0).optional(),
  share_count: z.number().int().min(0).optional(),
  save_count: z.number().int().min(0).optional(),
  engagement_rate: z.number().min(0).optional(),

  // Retention
  retention_1s: z.number().min(0).max(100).optional(),
  retention_3s: z.number().min(0).max(100).optional(),
  retention_5s: z.number().min(0).max(100).optional(),
  retention_10s: z.number().min(0).max(100).optional(),
  avg_watch_time: z.number().min(0).optional(),

  // Timestamps
  posted_at: z.string().optional(),
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
  const sourceType = searchParams.get('source_type') as 'generated' | 'external' | null;
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

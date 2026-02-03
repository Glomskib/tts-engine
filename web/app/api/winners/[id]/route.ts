import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { z } from 'zod';
import {
  fetchWinnerById,
  updateWinner,
  deleteWinner,
  type UpdateWinnerInput,
} from '@/lib/winners';

export const runtime = 'nodejs';

// Schema for updating a winner
const UpdateWinnerSchema = z.object({
  // Video details
  tiktok_url: z.string().url().optional(),
  video_title: z.string().max(255).optional(),
  thumbnail_url: z.string().url().optional(),
  posted_at: z.string().optional(),

  // Creator info
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

  // Status
  is_active: z.boolean().optional(),
});

/**
 * GET /api/winners/[id]
 * Get a single winner by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { winner, error } = await fetchWinnerById(id, authContext.user.id);

  if (error || !winner) {
    const response = NextResponse.json(
      { ok: false, error: error || 'Winner not found', correlation_id: correlationId },
      { status: 404 }
    );
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  const response = NextResponse.json({
    ok: true,
    winner,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * PATCH /api/winners/[id]
 * Update a winner
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const parsed = UpdateWinnerSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'Invalid input',
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  // Filter out undefined values to only update what was provided
  const input: UpdateWinnerInput = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      (input as Record<string, unknown>)[key] = value;
    }
  }

  if (Object.keys(input).length === 0) {
    return createApiErrorResponse('BAD_REQUEST', 'No valid fields to update', 400, correlationId);
  }

  const { winner, error } = await updateWinner(id, authContext.user.id, input);

  if (error) {
    console.error(`[${correlationId}] Failed to update winner:`, error);

    // Check if it's a not found error
    if (error.includes('No rows')) {
      return createApiErrorResponse('NOT_FOUND', 'Winner not found', 404, correlationId);
    }

    return createApiErrorResponse('DB_ERROR', 'Failed to update winner', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    winner,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * DELETE /api/winners/[id]
 * Soft-delete a winner (sets is_active = false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { success, error } = await deleteWinner(id, authContext.user.id);

  if (error) {
    console.error(`[${correlationId}] Failed to delete winner:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to delete winner', 500, correlationId);
  }

  if (!success) {
    return createApiErrorResponse('NOT_FOUND', 'Winner not found', 404, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    deleted: id,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

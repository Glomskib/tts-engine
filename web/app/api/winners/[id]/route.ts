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

// Schema for updating a winner — field names match winners_bank table
const UpdateWinnerSchema = z.object({
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
 * Delete a winner
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

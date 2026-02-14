import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateBrandSchema = z.object({
  name: z.string().min(1).max(255),
  logo_url: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  colors: z.array(z.string()).optional().default([]),
  tone_of_voice: z.string().max(5000).optional().nullable(),
  target_audience: z.string().max(5000).optional().nullable(),
  guidelines: z.string().max(5000).optional().nullable(),
  monthly_video_quota: z.number().int().min(0).optional().default(0),
  retainer_type: z.enum(['retainer', 'bonus', 'challenge', 'affiliate', 'none']).optional().default('none'),
  retainer_video_goal: z.number().int().min(0).optional().default(0),
  retainer_period_start: z.string().optional().nullable(),
  retainer_period_end: z.string().optional().nullable(),
  retainer_payout_amount: z.number().min(0).optional().default(0),
  retainer_bonus_tiers: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  retainer_notes: z.string().max(5000).optional().nullable(),
});

/**
 * GET /api/brands
 * List all brands for the current user
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('user_id', authContext.user.id)
    .order('name');

  if (error) {
    console.error('GET /api/brands error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
  return response;
}

/**
 * POST /api/brands
 * Create a new brand
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

  const parsed = CreateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'Invalid input',
      400,
      correlationId,
      { issues: parsed.error.issues }
    );
  }

  const input = parsed.data;

  // Check for duplicate brand name for this user
  const { data: existing } = await supabaseAdmin
    .from('brands')
    .select('id')
    .eq('user_id', authContext.user.id)
    .ilike('name', input.name)
    .limit(1);

  if (existing && existing.length > 0) {
    return createApiErrorResponse(
      'CONFLICT',
      `Brand "${input.name}" already exists`,
      409,
      correlationId
    );
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .insert({
      user_id: authContext.user.id,
      name: input.name,
      logo_url: input.logo_url,
      website: input.website,
      description: input.description,
      colors: input.colors,
      tone_of_voice: input.tone_of_voice,
      target_audience: input.target_audience,
      guidelines: input.guidelines,
      monthly_video_quota: input.monthly_video_quota,
      retainer_type: input.retainer_type,
      retainer_video_goal: input.retainer_video_goal,
      retainer_period_start: input.retainer_period_start,
      retainer_period_end: input.retainer_period_end,
      retainer_payout_amount: input.retainer_payout_amount,
      retainer_bonus_tiers: input.retainer_bonus_tiers,
      retainer_notes: input.retainer_notes,
    })
    .select()
    .single();

  if (error) {
    console.error('POST /api/brands error:', error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  const response = NextResponse.json({ ok: true, data, correlation_id: correlationId });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * GET  /api/user/creator-profile  — fetch the current user's creator profile
 * PUT  /api/user/creator-profile  — upsert (partial or full update)
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { CreatorProfileSchema } from '@/lib/creator-profile/schema';
import { getUserId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('creator_profiles')
    .select('*')
    .eq('user_id', getUserId(authContext))
    .maybeSingle();

  if (error) {
    console.error('[creator-profile:GET]', error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch creator profile', 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: data ?? null, correlation_id: correlationId });
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(request: Request) {
  const correlationId = generateCorrelationId();
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

  const parsed = CreatorProfileSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', parsed.error.issues.map(i => i.message).join('; '), 400, correlationId);
  }

  const userId = getUserId(authContext);

  // Strip undefined values so we only update supplied fields
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v;
  }

  const { data, error } = await supabaseAdmin
    .from('creator_profiles')
    .upsert(
      {
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();

  if (error) {
    console.error('[creator-profile:PUT]', error);
    return createApiErrorResponse('DB_ERROR', 'Failed to save creator profile', 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

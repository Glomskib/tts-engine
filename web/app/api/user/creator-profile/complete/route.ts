/**
 * POST /api/user/creator-profile/complete
 *
 * Marks the creator profile onboarding as complete by setting
 * completed_onboarding_at. Optionally saves any final fields in the body.
 * Also accepts an empty body (skip case).
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { CreatorProfileSchema } from '@/lib/creator-profile/schema';
import { getUserId } from '@/lib/auth/tenant';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const userId = getUserId(authContext);

  // Parse optional body (empty body is valid — skip scenario)
  let extra: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text);
      const parsed = CreatorProfileSchema.safeParse(body);
      if (parsed.success) {
        for (const [k, v] of Object.entries(parsed.data)) {
          if (v !== undefined) extra[k] = v;
        }
      }
    }
  } catch {
    // ignore parse errors — completing with whatever was already saved
  }

  const { data, error } = await supabaseAdmin
    .from('creator_profiles')
    .upsert(
      {
        user_id: userId,
        ...extra,
        completed_onboarding_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();

  if (error) {
    console.error('[creator-profile:complete]', error);
    return createApiErrorResponse('DB_ERROR', 'Failed to complete creator profile', 500, correlationId);
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

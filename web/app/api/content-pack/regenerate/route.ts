/**
 * POST /api/content-pack/regenerate
 *
 * Regenerates a single component (hooks, script, or visual_hooks)
 * of an existing content pack. Updates the pack in-place.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { regeneratePackComponent } from '@/lib/content-pack/orchestrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const body = await request.json();
    const { pack_id, component } = body;

    if (!pack_id || typeof pack_id !== 'string') {
      return createApiErrorResponse('BAD_REQUEST', 'pack_id is required', 400, correlationId);
    }

    if (!component || !['hooks', 'script', 'visual_hooks'].includes(component)) {
      return createApiErrorResponse('BAD_REQUEST', 'component must be hooks, script, or visual_hooks', 400, correlationId);
    }

    // Fetch existing pack
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('content_packs')
      .select('*')
      .eq('id', pack_id)
      .eq('user_id', authContext.user.id)
      .single();

    if (fetchError || !existing) {
      return createApiErrorResponse('NOT_FOUND', 'Pack not found', 404, correlationId);
    }

    // Regenerate the requested component
    const result = await regeneratePackComponent(existing, component, authContext.user.id);

    // Update in DB
    const updates: Record<string, unknown> = {
      [component]: result.data,
      status: result.status,
      updated_at: new Date().toISOString(),
    };

    // If we regenerated hooks or script, refresh title variants
    if (result.title_variants) {
      updates.title_variants = result.title_variants;
    }

    const { error: updateError } = await supabaseAdmin
      .from('content_packs')
      .update(updates)
      .eq('id', pack_id)
      .eq('user_id', authContext.user.id);

    if (updateError) {
      console.error(`[${correlationId}] regenerate save error:`, updateError);
      return createApiErrorResponse('DB_ERROR', 'Regenerated but failed to save', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      component,
      data: result.data,
      status: result.status,
      title_variants: result.title_variants,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] regenerate error:`, err);
    return createApiErrorResponse('AI_ERROR', 'Regeneration failed', 500, correlationId);
  }
}

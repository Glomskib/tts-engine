/**
 * POST /api/content-pack/generate
 *
 * Generates a complete content pack (hooks + script + visual hooks)
 * for a single topic/idea. Persists to content_packs table.
 *
 * Returns the full pack immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { orchestrateContentPack } from '@/lib/content-pack/orchestrate';
import type { ContentPackInput } from '@/lib/content-pack/types';

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
    const { topic, source_type, product_id, seed_hook, context, platform, niche, vibe } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return createApiErrorResponse('BAD_REQUEST', 'topic is required', 400, correlationId);
    }

    const input: ContentPackInput = {
      source_type: source_type || 'topic',
      topic: topic.trim(),
      product_id: product_id || undefined,
      seed_hook: seed_hook || undefined,
      context: context || undefined,
      platform: platform || 'tiktok',
      niche: niche || undefined,
      vibe: vibe || undefined,
    };

    // Orchestrate: hooks + script + visual hooks in parallel
    const pack = await orchestrateContentPack(input, authContext.user.id);

    // Check if we got anything useful
    const hasContent = pack.hooks.length > 0 || pack.script || pack.visual_hooks.length > 0;
    if (!hasContent) {
      return createApiErrorResponse('AI_ERROR', 'Pack generation failed — try again', 500, correlationId);
    }

    // Persist to DB
    const { data: saved, error: saveError } = await supabaseAdmin
      .from('content_packs')
      .insert({
        user_id: authContext.user.id,
        source_type: pack.source_type,
        topic: pack.topic,
        hooks: pack.hooks,
        script: pack.script,
        visual_hooks: pack.visual_hooks,
        title_variants: pack.title_variants,
        meta: pack.meta,
        status: pack.status,
      })
      .select('id, created_at')
      .single();

    if (saveError) {
      console.error(`[${correlationId}] content pack save error:`, saveError);
      // Still return the pack even if save fails — data is useful
      return NextResponse.json({
        ok: true,
        data: { ...pack, id: 'unsaved', created_at: new Date().toISOString() },
        saved: false,
        correlation_id: correlationId,
      });
    }

    return NextResponse.json({
      ok: true,
      data: { ...pack, id: saved.id, created_at: saved.created_at },
      saved: true,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] content pack error:`, err);
    return createApiErrorResponse('AI_ERROR', 'Pack generation failed', 500, correlationId);
  }
}

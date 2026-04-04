/**
 * GET   /api/comment-miner  — List user's comment themes
 * POST  /api/comment-miner  — Trigger comment mining
 * PATCH /api/comment-miner  — Dismiss/un-dismiss a theme
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mineComments } from '@/lib/comment-miner/mine';
import type { CommentTheme } from '@/lib/comment-miner/types';

export const runtime = 'nodejs';

// ── GET: list themes ──

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const includeDismissed = url.searchParams.get('dismissed') === '1';

  try {
    let query = supabaseAdmin
      .from('comment_themes')
      .select('*')
      .eq('user_id', authContext.user.id)
      .order('opportunity_score', { ascending: false });

    if (!includeDismissed) {
      query = query.eq('dismissed', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] comment themes list error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to load themes', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      themes: (data || []) as CommentTheme[],
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] comment themes list error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to load themes', 500, correlationId);
  }
}

// ── POST: trigger mining ──

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const result = await mineComments(authContext.user.id);

    return NextResponse.json({
      ok: true,
      ...result,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] comment mining error:`, err);
    const message = err instanceof Error ? err.message : 'Mining failed';
    return createApiErrorResponse('AI_ERROR', message, 500, correlationId);
  }
}

// ── PATCH: dismiss/un-dismiss a theme ──

export async function PATCH(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const body = await request.json();
    const { id, dismissed } = body;

    if (!id || typeof id !== 'string') {
      return createApiErrorResponse('BAD_REQUEST', 'Theme id is required', 400, correlationId);
    }
    if (typeof dismissed !== 'boolean') {
      return createApiErrorResponse('BAD_REQUEST', 'dismissed must be a boolean', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('comment_themes')
      .update({ dismissed })
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .select('id, dismissed')
      .single();

    if (error) {
      console.error(`[${correlationId}] comment theme update error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to update theme', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] comment theme update error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to update theme', 500, correlationId);
  }
}

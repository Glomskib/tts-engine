/**
 * GET  /api/content-pack          — List user's content packs (paginated)
 * PATCH /api/content-pack         — Update pack (favorite, notes, regenerated components)
 * DELETE /api/content-pack        — Delete a pack
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// ── GET: list packs ──

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const search = url.searchParams.get('search')?.trim() || '';
  const source = url.searchParams.get('source') || '';
  const favoritesOnly = url.searchParams.get('favorites') === '1';

  try {
    // Single pack fetch by ID
    if (id) {
      const { data: single, error: singleErr } = await supabaseAdmin
        .from('content_packs')
        .select('id, topic, source_type, hooks, script, visual_hooks, title_variants, meta, status, favorited, notes, created_at, updated_at')
        .eq('id', id)
        .eq('user_id', authContext.user.id)
        .single();

      if (singleErr || !single) {
        return createApiErrorResponse('NOT_FOUND', 'Pack not found', 404, correlationId);
      }

      return NextResponse.json({ ok: true, data: single, correlation_id: correlationId });
    }

    let query = supabaseAdmin
      .from('content_packs')
      .select('id, topic, source_type, hooks, script, visual_hooks, title_variants, meta, status, favorited, notes, created_at, updated_at', { count: 'exact' })
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('topic', `%${search}%`);
    }
    if (source) {
      query = query.eq('source_type', source);
    }
    if (favoritesOnly) {
      query = query.eq('favorited', true);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error(`[${correlationId}] content packs list error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to load packs', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      total: count || 0,
      limit,
      offset,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] content packs list error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to load packs', 500, correlationId);
  }
}

// ── PATCH: update pack (favorite, notes, regenerated component) ──

export async function PATCH(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const body = await request.json();
    const { id, favorited, notes, hooks, script, visual_hooks, title_variants, status } = body;

    if (!id || typeof id !== 'string') {
      return createApiErrorResponse('BAD_REQUEST', 'Pack id is required', 400, correlationId);
    }

    // Build update object — only include fields that were sent
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof favorited === 'boolean') updates.favorited = favorited;
    if (typeof notes === 'string') updates.notes = notes;
    if (hooks !== undefined) updates.hooks = hooks;
    if (script !== undefined) updates.script = script;
    if (visual_hooks !== undefined) updates.visual_hooks = visual_hooks;
    if (title_variants !== undefined) updates.title_variants = title_variants;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabaseAdmin
      .from('content_packs')
      .update(updates)
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .select('id, favorited, notes, updated_at')
      .single();

    if (error) {
      console.error(`[${correlationId}] content pack update error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to update pack', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] content pack update error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to update pack', 500, correlationId);
  }
}

// ── DELETE: delete a pack ──

export async function DELETE(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);

  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return createApiErrorResponse('BAD_REQUEST', 'Pack id is required', 400, correlationId);
    }

    const { error } = await supabaseAdmin
      .from('content_packs')
      .delete()
      .eq('id', id)
      .eq('user_id', authContext.user.id);

    if (error) {
      console.error(`[${correlationId}] content pack delete error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to delete pack', 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    console.error(`[${correlationId}] content pack delete error:`, err);
    return createApiErrorResponse('DB_ERROR', 'Failed to delete pack', 500, correlationId);
  }
}

/**
 * GET  /api/launch-sync/[id]/affiliates  — list affiliates for a launch
 * POST /api/launch-sync/[id]/affiliates  — add affiliate to a launch
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import crypto from 'crypto';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin
    .from('launch_affiliates')
    .select('*')
    .eq('launch_id', id)
    .eq('workspace_id', user.id)
    .order('total_views', { ascending: false });

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;

  let body: {
    name: string;
    email?: string;
    tiktok_handle?: string;
    platform?: string;
    commission_pct?: number;
    notes?: string;
  };

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  if (!body.name?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'name is required', 400, correlationId);
  }

  // Verify launch exists and belongs to user
  const { data: launch } = await supabaseAdmin
    .from('product_launches')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!launch) return createApiErrorResponse('NOT_FOUND', 'Launch not found', 404, correlationId);

  const inviteCode = crypto.randomBytes(4).toString('hex');

  const { data, error } = await supabaseAdmin
    .from('launch_affiliates')
    .insert({
      launch_id: id,
      workspace_id: user.id,
      name: body.name.trim(),
      email: body.email?.trim() || null,
      tiktok_handle: body.tiktok_handle?.trim() || null,
      platform: body.platform || 'tiktok',
      commission_pct: body.commission_pct || 0,
      invite_code: inviteCode,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
}

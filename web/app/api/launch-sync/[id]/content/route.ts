/**
 * GET  /api/launch-sync/[id]/content  — list content pieces for a launch
 * POST /api/launch-sync/[id]/content  — add content piece to a launch
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;
  const p = request.nextUrl.searchParams;
  const status = p.get('status');

  let query = supabaseAdmin
    .from('launch_content')
    .select('*, launch_affiliates(name, tiktok_handle)')
    .eq('launch_id', id)
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  const items = (data || []).map(d => ({
    ...d,
    affiliate_name: d.launch_affiliates?.name || null,
    affiliate_handle: d.launch_affiliates?.tiktok_handle || null,
    launch_affiliates: undefined,
  }));

  return NextResponse.json({ ok: true, data: items, correlation_id: correlationId });
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;

  let body: {
    title?: string;
    hook_text?: string;
    script_text?: string;
    affiliate_id?: string;
    creator_name?: string;
    status?: string;
    notes?: string;
  };

  try { body = await request.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  // Verify launch exists
  const { data: launch } = await supabaseAdmin
    .from('product_launches')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!launch) return createApiErrorResponse('NOT_FOUND', 'Launch not found', 404, correlationId);

  const { data, error } = await supabaseAdmin
    .from('launch_content')
    .insert({
      launch_id: id,
      workspace_id: user.id,
      title: body.title || null,
      hook_text: body.hook_text || null,
      script_text: body.script_text || null,
      affiliate_id: body.affiliate_id || null,
      creator_name: body.creator_name || null,
      status: body.status || 'idea',
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  // Increment video count on launch (non-fatal)
  try {
    const { data: launch } = await supabaseAdmin
      .from('product_launches')
      .select('total_videos_created')
      .eq('id', id)
      .single();
    if (launch) {
      await supabaseAdmin
        .from('product_launches')
        .update({ total_videos_created: (launch.total_videos_created || 0) + 1 })
        .eq('id', id);
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId }, { status: 201 });
}

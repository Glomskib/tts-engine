/**
 * API: Experiments CRUD
 *
 * GET  /api/brand/experiments?brand_id=<uuid>   — list experiments for a brand
 * POST /api/brand/experiments                    — create a new experiment
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { getBrandRole } from '@/lib/brands/permissions';

export const runtime = 'nodejs';

export const GET = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user, isAdmin } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const url = new URL(request.url);
  const brandId = url.searchParams.get('brand_id');
  if (!brandId) {
    return createApiErrorResponse('BAD_REQUEST', 'brand_id is required', 400, correlationId);
  }

  if (!isAdmin) {
    const role = await getBrandRole(user.id, brandId);
    if (!role) {
      return createApiErrorResponse('UNAUTHORIZED', 'No access to this brand', 403, correlationId);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('experiments')
    .select('*, brands:brand_id(name), products:product_id(name)')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: (data || []).map((e: Record<string, unknown>) => ({
      ...e,
      brand_name: (e.brands as { name: string } | null)?.name || null,
      product_name: (e.products as { name: string } | null)?.name || null,
    })),
    correlation_id: correlationId,
  });
}, { routeName: '/api/brand/experiments', feature: 'experiments' });

export const POST = withErrorCapture(async (request: Request) => {
  const correlationId = generateCorrelationId();
  const { user, isAdmin } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const body = await request.json();
  const { brand_id, product_id, name, goal, hypothesis } = body;

  if (!brand_id || !name?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'brand_id and name are required', 400, correlationId);
  }

  // Only operators can create experiments
  if (!isAdmin) {
    const role = await getBrandRole(user.id, brand_id);
    if (role !== 'operator') {
      return createApiErrorResponse('UNAUTHORIZED', 'Only operators can create experiments', 403, correlationId);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('experiments')
    .insert({
      workspace_id: user.id,
      brand_id,
      product_id: product_id || null,
      name: name.trim(),
      goal: goal?.trim() || null,
      hypothesis: hypothesis?.trim() || null,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data,
    correlation_id: correlationId,
  }, { status: 201 });
}, { routeName: '/api/brand/experiments', feature: 'experiments' });

/**
 * GET  /api/admin/ideas?status=&q=&tag=&limit=
 * POST /api/admin/ideas
 *
 * Admin-only CRUD for the ideas pool.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CreateIdeaSchema } from '@/lib/command-center/validators';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const denied = await requireOwner(request);
  if (denied) return denied;

  const statusFilter = searchParams.get('status');
  const tagFilter = searchParams.get('tag');
  const qFilter = searchParams.get('q');
  const initiativeFilter = searchParams.get('initiative_id');
  const limitParam = parseInt(searchParams.get('limit') || '50', 10);
  const limit = Math.min(Math.max(1, limitParam), 200);

  try {
    // If filtering by initiative, resolve project types under that initiative
    let initiativeTags: string[] | null = null;
    if (initiativeFilter) {
      const { data: initProjects } = await supabaseAdmin
        .from('cc_projects')
        .select('type')
        .eq('initiative_id', initiativeFilter);
      initiativeTags = [...new Set((initProjects || []).map((p) => p.type as string))];
    }

    let query = supabaseAdmin
      .from('ideas')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (tagFilter) {
      query = query.contains('tags', [tagFilter]);
    }
    if (qFilter) {
      query = query.or(`title.ilike.%${qFilter}%,prompt.ilike.%${qFilter}%`);
    }
    if (initiativeTags && initiativeTags.length > 0) {
      query = query.overlaps('tags', initiativeTags);
    }
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[api/admin/ideas] GET error:', error);
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: data || [],
      count: data?.length ?? 0,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/ideas] GET error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const denied = await requireOwner(request);
  if (denied) return denied;

  // Get user email for created_by field
  const auth = await getApiAuthContext(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = CreateIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('ideas')
      .insert({
        title: parsed.data.title,
        prompt: parsed.data.prompt,
        tags: parsed.data.tags,
        mode: parsed.data.mode,
        priority: parsed.data.priority,
        created_by: parsed.data.created_by ?? auth.user?.email ?? null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[api/admin/ideas] POST error:', error);
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data,
    }, { status: 201 });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/ideas] POST error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

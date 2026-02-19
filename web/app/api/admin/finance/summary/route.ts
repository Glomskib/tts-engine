/**
 * GET /api/admin/finance/summary?from=&to=
 *
 * Admin-only. Returns cashflow summary for a date range:
 * total in/out, by category, by project.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const { searchParams } = new URL(request.url);

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);
  const initiativeFilter = searchParams.get('initiative_id');

  try {
    let txQuery = supabaseAdmin
      .from('finance_transactions')
      .select('direction, amount, category, project_id, initiative_id')
      .gte('ts', `${from}T00:00:00Z`)
      .lte('ts', `${to}T23:59:59Z`);

    if (initiativeFilter) {
      // Filter by initiative_id directly on transactions, or by project's initiative
      txQuery = txQuery.eq('initiative_id', initiativeFilter);
    }

    const { data: txns, error } = await txQuery;

    if (error) {
      console.error('[api/admin/finance/summary] error:', error);
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    // Fetch project names for labeling
    const projectIds = [...new Set((txns || []).map((t) => t.project_id).filter(Boolean))];
    let projectMap: Record<string, string> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabaseAdmin
        .from('cc_projects')
        .select('id, name')
        .in('id', projectIds);
      projectMap = Object.fromEntries((projects || []).map((p) => [p.id, p.name]));
    }

    let totalIn = 0;
    let totalOut = 0;
    const byCategory: Record<string, { in: number; out: number }> = {};
    const byProject: Record<string, { in: number; out: number; project_name: string }> = {};

    for (const t of txns || []) {
      const amt = Number(t.amount);
      if (t.direction === 'in') {
        totalIn += amt;
      } else {
        totalOut += amt;
      }

      // Category rollup
      if (!byCategory[t.category]) {
        byCategory[t.category] = { in: 0, out: 0 };
      }
      byCategory[t.category][t.direction as 'in' | 'out'] += amt;

      // Project rollup
      if (t.project_id) {
        if (!byProject[t.project_id]) {
          byProject[t.project_id] = { in: 0, out: 0, project_name: projectMap[t.project_id] || 'Unknown' };
        }
        byProject[t.project_id][t.direction as 'in' | 'out'] += amt;
      }
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        from,
        to,
        total_in: Math.round(totalIn * 100) / 100,
        total_out: Math.round(totalOut * 100) / 100,
        net: Math.round((totalIn - totalOut) * 100) / 100,
        by_category: byCategory,
        by_project: byProject,
      },
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error('[api/admin/finance/summary] error:', err);
    return createApiErrorResponse('DB_ERROR', 'Internal server error', 500, correlationId);
  }
}

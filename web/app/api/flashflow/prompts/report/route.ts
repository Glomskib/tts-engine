/**
 * GET /api/flashflow/prompts/report?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Per-version performance report. Admin-only.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

interface GenRow {
  id: string;
  template_id: string | null;
  prompt_version: string | null;
  prompt_version_id: string | null;
  status: string;
}

interface OutcomeRow {
  generation_id: string;
  rating: number | null;
  is_winner: boolean;
  is_rejected: boolean;
  is_regenerated: boolean;
  winner_score: number | null;
  tags: string[];
}

interface VersionStats {
  version_key: string;
  template_id: string | null;
  prompt_version_id: string | null;
  prompt_version: string | null;
  total_gens: number;
  winner_count: number;
  avg_winner_score: number | null;
  avg_rating: number | null;
  regen_count: number;
  reject_count: number;
  regen_rate: number;
  reject_rate: number;
  compliance_flags: number;
}

export async function GET(request: Request) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'start and end query params required (YYYY-MM-DD)',
      400,
      correlationId,
    );
  }

  const startDate = `${start}T00:00:00Z`;
  const endDate = `${end}T23:59:59Z`;

  // Fetch generations in range
  const { data: generations, error: genErr } = await supabaseAdmin
    .from('ff_generations')
    .select('id, template_id, prompt_version, prompt_version_id, status')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (genErr) {
    return createApiErrorResponse('DB_ERROR', genErr.message, 500, correlationId);
  }

  const gens = (generations ?? []) as GenRow[];
  const genIds = gens.map(g => g.id);

  let outcomes: OutcomeRow[] = [];
  if (genIds.length > 0) {
    const { data: oc, error: ocErr } = await supabaseAdmin
      .from('ff_outcomes')
      .select('generation_id, rating, is_winner, is_rejected, is_regenerated, winner_score, tags')
      .in('generation_id', genIds);

    if (ocErr) {
      return createApiErrorResponse('DB_ERROR', ocErr.message, 500, correlationId);
    }
    outcomes = (oc ?? []) as OutcomeRow[];
  }

  // Build outcome lookup
  const outcomeMap = new Map<string, OutcomeRow>();
  for (const o of outcomes) {
    outcomeMap.set(o.generation_id, o);
  }

  // Group by version key: prompt_version_id if present, else template_id+prompt_version
  const statsMap = new Map<string, VersionStats>();

  for (const gen of gens) {
    const versionKey = gen.prompt_version_id
      ? `pvid:${gen.prompt_version_id}`
      : `legacy:${gen.template_id ?? 'unknown'}:${gen.prompt_version ?? 'unknown'}`;

    let entry = statsMap.get(versionKey);
    if (!entry) {
      entry = {
        version_key: versionKey,
        template_id: gen.template_id,
        prompt_version_id: gen.prompt_version_id,
        prompt_version: gen.prompt_version,
        total_gens: 0,
        winner_count: 0,
        avg_winner_score: null,
        avg_rating: null,
        regen_count: 0,
        reject_count: 0,
        regen_rate: 0,
        reject_rate: 0,
        compliance_flags: 0,
      };
      statsMap.set(versionKey, entry);
    }

    entry.total_gens++;

    const oc = outcomeMap.get(gen.id);
    if (oc) {
      if (oc.is_winner) entry.winner_count++;
      if (oc.is_rejected) entry.reject_count++;
      if (oc.is_regenerated) entry.regen_count++;
      if (oc.tags && oc.tags.length > 0) {
        entry.compliance_flags += oc.tags.filter(t => t.includes('reject') || t.includes('compliance')).length;
      }
    }
  }

  // Compute averages
  for (const [versionKey, entry] of statsMap) {
    const genIdsForVersion = gens
      .filter(g => {
        const vk = g.prompt_version_id
          ? `pvid:${g.prompt_version_id}`
          : `legacy:${g.template_id ?? 'unknown'}:${g.prompt_version ?? 'unknown'}`;
        return vk === versionKey;
      })
      .map(g => g.id);

    const versionOutcomes = genIdsForVersion
      .map(id => outcomeMap.get(id))
      .filter((o): o is OutcomeRow => o !== undefined);

    const ratings = versionOutcomes
      .map(o => o.rating)
      .filter((r): r is number => r !== null);
    entry.avg_rating = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : null;

    const winnerScores = versionOutcomes
      .map(o => o.winner_score)
      .filter((s): s is number => s !== null);
    entry.avg_winner_score = winnerScores.length > 0
      ? Math.round((winnerScores.reduce((a, b) => a + b, 0) / winnerScores.length) * 100) / 100
      : null;

    entry.regen_rate = entry.total_gens > 0
      ? Math.round((entry.regen_count / entry.total_gens) * 10000) / 100
      : 0;
    entry.reject_rate = entry.total_gens > 0
      ? Math.round((entry.reject_count / entry.total_gens) * 10000) / 100
      : 0;
  }

  const report = Array.from(statsMap.values()).sort((a, b) => b.total_gens - a.total_gens);

  const res = NextResponse.json({
    ok: true,
    data: { period: { start, end }, versions: report },
    correlation_id: correlationId,
  });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}

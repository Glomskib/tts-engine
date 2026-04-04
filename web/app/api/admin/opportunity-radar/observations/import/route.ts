/**
 * API: Opportunity Radar — Bulk Import Observations from CSV
 *
 * POST /api/admin/opportunity-radar/observations/import
 *   Body: { csv: string, creator_id: string }
 *   CSV columns: product_name, product_url, brand_name, confidence, notes
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getWorkspaceId } from '@/lib/auth/tenant';
import { computeOpportunityScore } from '@/lib/opportunity-radar/scoring';
import type { ObservationConfidence, CreatorPriority } from '@/lib/opportunity-radar/types';

export const runtime = 'nodejs';

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = getWorkspaceId(authContext);
  const body = await request.json();
  const { csv, creator_id } = body;

  if (!csv?.trim() || !creator_id?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'csv and creator_id are required', 400, correlationId);
  }

  // Verify creator belongs to workspace
  const { data: creator } = await supabaseAdmin
    .from('creator_watchlist')
    .select('id, priority')
    .eq('id', creator_id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!creator) {
    return createApiErrorResponse('NOT_FOUND', 'Creator not found in watchlist', 404, correlationId);
  }

  const lines = csv.trim().split('\n');
  if (lines.length < 2) {
    return createApiErrorResponse('BAD_REQUEST', 'CSV must have a header row and at least one data row', 400, correlationId);
  }

  const header = parseCsvLine(lines[0]).map((h: string) => h.toLowerCase().replace(/\s+/g, '_'));
  const colMap: Record<string, number> = {};
  header.forEach((col: string, idx: number) => { colMap[col] = idx; });

  if (colMap['product_name'] === undefined) {
    return createApiErrorResponse('BAD_REQUEST', 'CSV must include column: product_name', 400, correlationId);
  }

  const validConfidence: ObservationConfidence[] = ['low', 'medium', 'high', 'confirmed'];
  let imported = 0;
  const errors: { row: number; error: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const productName = fields[colMap['product_name']]?.trim();

    if (!productName) {
      errors.push({ row: i + 1, error: 'Missing product_name' });
      continue;
    }

    const productUrl = colMap['product_url'] !== undefined ? fields[colMap['product_url']]?.trim() || null : null;
    const brandName = colMap['brand_name'] !== undefined ? fields[colMap['brand_name']]?.trim() || null : null;
    const rawConf = colMap['confidence'] !== undefined ? fields[colMap['confidence']]?.trim() : null;
    const obsNotes = colMap['notes'] !== undefined ? fields[colMap['notes']]?.trim() || null : null;

    const confidenceVal: ObservationConfidence = rawConf && validConfidence.includes(rawConf as ObservationConfidence)
      ? (rawConf as ObservationConfidence)
      : 'medium';

    const { data: observation, error: obsError } = await supabaseAdmin
      .from('creator_product_observations')
      .insert({
        workspace_id: workspaceId,
        creator_id: creator_id.trim(),
        product_name: productName,
        product_url: productUrl,
        brand_name: brandName,
        confidence: confidenceVal,
        observation_notes: obsNotes,
        source: 'import',
        creator_has_posted: false,
        first_seen_at: now,
        last_seen_at: now,
        times_seen: 1,
        created_by: authContext.user.id,
      })
      .select()
      .single();

    if (obsError) {
      errors.push({ row: i + 1, error: obsError.message });
      continue;
    }

    // Multi-creator count
    const { data: creatorIds } = await supabaseAdmin
      .from('creator_product_observations')
      .select('creator_id')
      .eq('workspace_id', workspaceId)
      .ilike('product_name', productName)
      .neq('creator_id', creator_id.trim());

    const uniqueOther = new Set((creatorIds || []).map((r: { creator_id: string }) => r.creator_id));

    const scoreBreakdown = computeOpportunityScore(
      {
        first_seen_at: observation.first_seen_at,
        creator_has_posted: false,
        confidence: confidenceVal,
        times_seen: 1,
      },
      creator.priority as CreatorPriority,
      uniqueOther.size,
    );

    await supabaseAdmin
      .from('opportunities')
      .insert({
        workspace_id: workspaceId,
        observation_id: observation.id,
        score: scoreBreakdown.total,
        score_breakdown: scoreBreakdown,
        status: 'new',
      });

    imported++;
  }

  return NextResponse.json({
    ok: true,
    data: { imported, errors: errors.length > 0 ? errors : undefined },
    correlation_id: correlationId,
  }, { status: 201 });
}

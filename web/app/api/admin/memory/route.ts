/**
 * GET  /api/admin/memory — debug: view knowledge graph snapshot
 * POST /api/admin/memory — trigger knowledge extraction
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { extractKnowledge } from '@/lib/knowledge-graph/extract';
import { getGenerationKnowledgeContext } from '@/lib/knowledge-graph/retrieve';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const workspaceId = user.id;

  // Fetch nodes grouped by type
  const { data: nodes } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('node_type, label, confidence, occurrences, source, last_seen_at')
    .eq('workspace_id', workspaceId)
    .order('confidence', { ascending: false })
    .limit(100);

  // Fetch edge count
  const { count: edgeCount } = await supabaseAdmin
    .from('knowledge_edges')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  // Get current generation context
  const generationCtx = await getGenerationKnowledgeContext(workspaceId).catch(() => ({
    prompt: '',
    hasData: false,
    nodeCount: 0,
  }));

  // Group nodes by type
  const byType: Record<string, Array<{ label: string; confidence: number; occurrences: number; source: string }>> = {};
  for (const n of nodes || []) {
    if (!byType[n.node_type]) byType[n.node_type] = [];
    byType[n.node_type].push({
      label: n.label,
      confidence: n.confidence,
      occurrences: n.occurrences,
      source: n.source,
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      total_nodes: nodes?.length || 0,
      total_edges: edgeCount || 0,
      nodes_by_type: byType,
      generation_context_preview: generationCtx.prompt.slice(0, 1000) || '(empty)',
      generation_context_has_data: generationCtx.hasData,
    },
    correlation_id: correlationId,
  });
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const result = await extractKnowledge(user.id);

    return NextResponse.json({
      ok: result.ok,
      data: {
        sources: result.sources,
        total_nodes: result.totalNodes,
        total_edges: result.totalEdges,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error('[memory] extraction failed:', err instanceof Error ? err.message : err);
    return createApiErrorResponse('INTERNAL', 'Knowledge extraction failed', 500, correlationId);
  }
}

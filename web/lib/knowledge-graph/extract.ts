/**
 * Knowledge Graph — Memory Extraction Pipeline
 *
 * Extracts knowledge nodes and edges from existing FlashFlow systems:
 * - comment_themes → objections, questions, pain_points
 * - content_memory → hook_styles, content_angles, products
 * - creator_profile_dimensions → formats, hook_styles (performance-backed)
 * - proven_hooks → hook_styles with win/reject data
 * - trend_clusters → trends, topics
 *
 * Called periodically or on-demand. Idempotent via upsert on unique keys.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { NodeType, RelationshipType } from './types';

const LOG = '[knowledge-graph]';

interface NodeUpsert {
  workspace_id: string;
  node_type: NodeType;
  label: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
  source: string;
}

interface EdgeUpsert {
  workspace_id: string;
  source: { node_type: NodeType; label: string };
  target: { node_type: NodeType; label: string };
  relationship: RelationshipType;
  strength?: number;
}

// ── Node upsert (idempotent) ──

async function upsertNode(node: NodeUpsert): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('id, occurrences, confidence')
    .eq('workspace_id', node.workspace_id)
    .eq('node_type', node.node_type)
    .eq('label', node.label)
    .maybeSingle();

  if (existing) {
    const newConf = node.confidence !== undefined
      ? Math.max(existing.confidence, node.confidence)
      : existing.confidence;
    await supabaseAdmin
      .from('knowledge_nodes')
      .update({
        occurrences: existing.occurrences + 1,
        confidence: newConf,
        metadata: node.metadata || {},
        last_seen_at: now,
        updated_at: now,
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: inserted } = await supabaseAdmin
    .from('knowledge_nodes')
    .insert({
      workspace_id: node.workspace_id,
      node_type: node.node_type,
      label: node.label,
      metadata: node.metadata || {},
      confidence: node.confidence ?? 0.5,
      source: node.source,
      occurrences: 1,
      last_seen_at: now,
    })
    .select('id')
    .single();

  return inserted?.id ?? null;
}

// ── Edge upsert (idempotent) ──

async function upsertEdge(edge: EdgeUpsert): Promise<void> {
  // Resolve node IDs
  const { data: srcNode } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('id')
    .eq('workspace_id', edge.workspace_id)
    .eq('node_type', edge.source.node_type)
    .eq('label', edge.source.label)
    .maybeSingle();

  const { data: tgtNode } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('id')
    .eq('workspace_id', edge.workspace_id)
    .eq('node_type', edge.target.node_type)
    .eq('label', edge.target.label)
    .maybeSingle();

  if (!srcNode?.id || !tgtNode?.id) return;

  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from('knowledge_edges')
    .select('id, evidence_count, strength')
    .eq('workspace_id', edge.workspace_id)
    .eq('source_node_id', srcNode.id)
    .eq('target_node_id', tgtNode.id)
    .eq('relationship', edge.relationship)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('knowledge_edges')
      .update({
        evidence_count: existing.evidence_count + 1,
        strength: edge.strength !== undefined
          ? Math.max(existing.strength, edge.strength)
          : existing.strength,
        updated_at: now,
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('knowledge_edges').insert({
      workspace_id: edge.workspace_id,
      source_node_id: srcNode.id,
      target_node_id: tgtNode.id,
      relationship: edge.relationship,
      strength: edge.strength ?? 0.5,
    });
  }
}

// ── Extraction from comment themes ──

async function extractFromCommentThemes(workspaceId: string): Promise<number> {
  const { data: themes } = await supabaseAdmin
    .from('comment_themes')
    .select('theme, category, comment_count, opportunity_score, content_angle')
    .eq('user_id', workspaceId)
    .eq('dismissed', false)
    .order('opportunity_score', { ascending: false })
    .limit(30);

  if (!themes?.length) return 0;

  let count = 0;
  for (const t of themes) {
    const nodeType: NodeType =
      t.category === 'objection' ? 'objection' :
      t.category === 'question' ? 'question' :
      t.category === 'pain_point' ? 'pain_point' :
      t.category === 'request' ? 'content_angle' :
      t.category === 'praise_pattern' ? 'content_angle' :
      'content_angle';

    const confidence = Math.min(1, t.opportunity_score / 100);

    await upsertNode({
      workspace_id: workspaceId,
      node_type: nodeType,
      label: t.theme.slice(0, 200),
      metadata: { comment_count: t.comment_count, content_angle: t.content_angle },
      confidence,
      source: 'comment_miner',
    });
    count++;
  }

  return count;
}

// ── Extraction from content memory ──

async function extractFromContentMemory(workspaceId: string): Promise<number> {
  const { data: memories } = await supabaseAdmin
    .from('content_memory')
    .select('memory_type, value, performance_score, occurrences')
    .eq('workspace_id', workspaceId)
    .gte('occurrences', 2)
    .order('performance_score', { ascending: false })
    .limit(50);

  if (!memories?.length) return 0;

  let count = 0;
  for (const m of memories) {
    const nodeType: NodeType =
      m.memory_type === 'hook' ? 'hook_style' :
      m.memory_type === 'pattern' ? 'content_angle' :
      m.memory_type === 'product' ? 'product' :
      m.memory_type === 'format' ? 'format' :
      'content_angle';

    const confidence = Math.min(1, m.performance_score / 10);

    await upsertNode({
      workspace_id: workspaceId,
      node_type: nodeType,
      label: m.value.slice(0, 200),
      metadata: { performance_score: m.performance_score, occurrences: m.occurrences },
      confidence,
      source: 'content_memory',
    });
    count++;
  }

  return count;
}

// ── Extraction from performance dimensions ──

async function extractFromPerformanceDimensions(workspaceId: string): Promise<number> {
  const { data: dims } = await supabaseAdmin
    .from('creator_profile_dimensions')
    .select('dimension, dimension_value, sample_size, avg_score, win_rate')
    .eq('workspace_id', workspaceId)
    .gte('sample_size', 3)
    .order('avg_score', { ascending: false })
    .limit(40);

  if (!dims?.length) return 0;

  let count = 0;
  for (const d of dims) {
    const nodeType: NodeType =
      d.dimension === 'hook_pattern' || d.dimension === 'hook_type' ? 'hook_style' :
      d.dimension === 'angle' ? 'content_angle' :
      d.dimension === 'format' ? 'format' :
      d.dimension === 'product' ? 'product' :
      d.dimension === 'length_bucket' ? 'format' :
      'content_angle';

    const label = d.dimension === 'length_bucket'
      ? `${d.dimension_value} duration`
      : d.dimension_value;

    const confidence = Math.min(1, d.avg_score / 100);

    await upsertNode({
      workspace_id: workspaceId,
      node_type: nodeType,
      label: label.slice(0, 200),
      metadata: { avg_score: d.avg_score, win_rate: d.win_rate, sample_size: d.sample_size, dimension: d.dimension },
      confidence,
      source: 'performance_profile',
    });
    count++;
  }

  return count;
}

// ── Extraction from proven hooks ──

async function extractFromProvenHooks(workspaceId: string): Promise<number> {
  // proven_hooks are brand-scoped, not workspace-scoped.
  // Attempt with workspace fallback to global top hooks.
  const { data: hooks } = await supabaseAdmin
    .from('proven_hooks')
    .select('hook_text, hook_type, hook_family, winner_count, approved_count, rejected_count, underperform_count')
    .gte('approved_count', 1)
    .order('winner_count', { ascending: false })
    .limit(20);

  if (!hooks?.length) return 0;

  let count = 0;
  for (const h of hooks) {
    if (!h.hook_family && !h.hook_type) continue;

    const label = h.hook_family || h.hook_type || 'unknown';
    const winRate = h.winner_count / Math.max(1, h.approved_count);
    const confidence = Math.min(1, winRate + 0.3);

    await upsertNode({
      workspace_id: workspaceId,
      node_type: 'hook_style',
      label: label.slice(0, 200),
      metadata: {
        example: h.hook_text?.slice(0, 100),
        winner_count: h.winner_count,
        rejected_count: h.rejected_count,
      },
      confidence: h.rejected_count > h.winner_count ? 0.2 : confidence,
      source: 'proven_hooks',
    });
    count++;
  }

  return count;
}

// ── Extraction from trend clusters ──

async function extractFromTrends(workspaceId: string): Promise<number> {
  const { data: clusters } = await supabaseAdmin
    .from('trend_clusters')
    .select('display_name, trend_score, recommendation, community_best_hook')
    .eq('workspace_id', workspaceId)
    .in('recommendation', ['ACT_NOW', 'TEST_SOON'])
    .neq('status', 'dismissed')
    .order('trend_score', { ascending: false })
    .limit(10);

  if (!clusters?.length) return 0;

  let count = 0;
  for (const c of clusters) {
    await upsertNode({
      workspace_id: workspaceId,
      node_type: 'trend',
      label: c.display_name.slice(0, 200),
      metadata: { trend_score: c.trend_score, recommendation: c.recommendation, best_hook: c.community_best_hook },
      confidence: Math.min(1, c.trend_score / 100),
      source: 'trend_clusters',
    });
    count++;

    // Create edge: trend → related_to → content_angle if best hook exists
    if (c.community_best_hook) {
      await upsertNode({
        workspace_id: workspaceId,
        node_type: 'hook_style',
        label: c.community_best_hook.slice(0, 200),
        confidence: 0.4,
        source: 'trend_clusters',
      });
      await upsertEdge({
        workspace_id: workspaceId,
        source: { node_type: 'trend', label: c.display_name.slice(0, 200) },
        target: { node_type: 'hook_style', label: c.community_best_hook.slice(0, 200) },
        relationship: 'pairs_with',
        strength: Math.min(1, c.trend_score / 100),
      });
    }
  }

  return count;
}

// ── Build edges from co-occurring patterns ──

async function buildPerformanceEdges(workspaceId: string): Promise<number> {
  // Connect high-performing hook_styles to their best formats and angles
  const { data: hookNodes } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('id, label, confidence')
    .eq('workspace_id', workspaceId)
    .eq('node_type', 'hook_style')
    .gte('confidence', 0.5)
    .order('confidence', { ascending: false })
    .limit(5);

  const { data: formatNodes } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('id, label, confidence')
    .eq('workspace_id', workspaceId)
    .eq('node_type', 'format')
    .gte('confidence', 0.5)
    .order('confidence', { ascending: false })
    .limit(3);

  if (!hookNodes?.length || !formatNodes?.length) return 0;

  let count = 0;
  // Top hooks pair with top formats
  for (const hook of hookNodes.slice(0, 3)) {
    for (const fmt of formatNodes.slice(0, 2)) {
      await upsertEdge({
        workspace_id: workspaceId,
        source: { node_type: 'hook_style', label: hook.label },
        target: { node_type: 'format', label: fmt.label },
        relationship: 'performs_well_with',
        strength: Math.min(hook.confidence, fmt.confidence),
      });
      count++;
    }
  }

  return count;
}

// ── Main extraction function ──

/**
 * Run full knowledge extraction for a workspace.
 * Idempotent — safe to run multiple times.
 * Returns counts of nodes extracted per source.
 */
export async function extractKnowledge(workspaceId: string): Promise<{
  ok: boolean;
  sources: Record<string, number>;
  totalNodes: number;
  totalEdges: number;
}> {
  console.log(LOG, `extracting knowledge for workspace=${workspaceId}`);

  const [comments, memory, performance, hooks, trends] = await Promise.allSettled([
    extractFromCommentThemes(workspaceId),
    extractFromContentMemory(workspaceId),
    extractFromPerformanceDimensions(workspaceId),
    extractFromProvenHooks(workspaceId),
    extractFromTrends(workspaceId),
  ]);

  const val = <T>(r: PromiseSettledResult<T>, d: T): T =>
    r.status === 'fulfilled' ? r.value : d;

  const sources = {
    comment_themes: val(comments, 0),
    content_memory: val(memory, 0),
    performance_dimensions: val(performance, 0),
    proven_hooks: val(hooks, 0),
    trends: val(trends, 0),
  };

  const totalNodes = Object.values(sources).reduce((a, b) => a + b, 0);

  // Build edges after all nodes are in
  const edgeResult = await buildPerformanceEdges(workspaceId).catch(() => 0);

  console.log(LOG, `extraction complete: ${totalNodes} nodes, ${edgeResult} edges`);

  return { ok: true, sources, totalNodes, totalEdges: edgeResult };
}

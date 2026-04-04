/**
 * Knowledge Graph — Memory Retrieval
 *
 * Fast retrieval functions that produce prompt-ready context strings.
 * Each function is non-fatal: returns empty context if data is missing.
 *
 * Performance target: <50ms per retrieval (single indexed query each).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { KnowledgeContext, NodeType } from './types';

const EMPTY: KnowledgeContext = { prompt: '', hasData: false, nodeCount: 0 };

// ── Helpers ──

interface NodeRow {
  node_type: string;
  label: string;
  confidence: number;
  occurrences: number;
  metadata: Record<string, unknown>;
}

async function fetchTopNodes(
  workspaceId: string,
  nodeTypes: NodeType[],
  limit = 20,
): Promise<NodeRow[]> {
  const { data } = await supabaseAdmin
    .from('knowledge_nodes')
    .select('node_type, label, confidence, occurrences, metadata')
    .eq('workspace_id', workspaceId)
    .in('node_type', nodeTypes)
    .gte('confidence', 0.3)
    .order('confidence', { ascending: false })
    .limit(limit);

  return (data || []) as NodeRow[];
}

// ── Creator Knowledge Context ──

/**
 * Returns creator-level knowledge: products, niches, tone patterns.
 * Used in all generation systems.
 */
export async function getCreatorKnowledgeContext(workspaceId: string): Promise<KnowledgeContext> {
  try {
    const nodes = await fetchTopNodes(workspaceId, [
      'product', 'hook_style', 'content_angle', 'format', 'cta_style',
    ], 25);

    if (nodes.length === 0) return EMPTY;

    const byType = new Map<string, NodeRow[]>();
    for (const n of nodes) {
      if (!byType.has(n.node_type)) byType.set(n.node_type, []);
      byType.get(n.node_type)!.push(n);
    }

    const sections: string[] = [];
    sections.push('=== CREATOR KNOWLEDGE (accumulated from your content history) ===');

    const products = byType.get('product');
    if (products?.length) {
      sections.push(`Products you promote: ${products.slice(0, 5).map(p => p.label).join(', ')}`);
    }

    const hookStyles = byType.get('hook_style');
    if (hookStyles?.length) {
      const strong = hookStyles.filter(h => h.confidence >= 0.5).slice(0, 3);
      if (strong.length) {
        sections.push(`Your strongest hook styles: ${strong.map(h => `"${h.label}"`).join(', ')}`);
      }
    }

    const angles = byType.get('content_angle');
    if (angles?.length) {
      sections.push(`Content angles that work: ${angles.slice(0, 3).map(a => `"${a.label}"`).join(', ')}`);
    }

    const formats = byType.get('format');
    if (formats?.length) {
      sections.push(`Best formats: ${formats.slice(0, 3).map(f => f.label).join(', ')}`);
    }

    const ctaStyles = byType.get('cta_style');
    if (ctaStyles?.length) {
      sections.push(`CTA style: ${ctaStyles[0].label}`);
    }

    sections.push('===');

    return {
      prompt: sections.join('\n'),
      hasData: true,
      nodeCount: nodes.length,
    };
  } catch {
    return EMPTY;
  }
}

// ── Audience Knowledge Context ──

/**
 * Returns audience-level knowledge: questions, objections, pain points.
 * Used in hook/script generation and content packs.
 */
export async function getAudienceKnowledgeContext(workspaceId: string): Promise<KnowledgeContext> {
  try {
    const nodes = await fetchTopNodes(workspaceId, [
      'question', 'objection', 'pain_point', 'audience_trait',
    ], 15);

    if (nodes.length === 0) return EMPTY;

    const byType = new Map<string, NodeRow[]>();
    for (const n of nodes) {
      if (!byType.has(n.node_type)) byType.set(n.node_type, []);
      byType.get(n.node_type)!.push(n);
    }

    const sections: string[] = [];
    sections.push('=== AUDIENCE KNOWLEDGE (from your comments and engagement data) ===');

    const questions = byType.get('question');
    if (questions?.length) {
      sections.push('Your audience frequently asks:');
      for (const q of questions.slice(0, 3)) {
        const count = (q.metadata?.comment_count as number) || q.occurrences;
        sections.push(`  - "${q.label}"${count > 1 ? ` (${count} comments)` : ''}`);
      }
    }

    const objections = byType.get('objection');
    if (objections?.length) {
      sections.push('Common objections to address:');
      for (const o of objections.slice(0, 3)) {
        sections.push(`  - "${o.label}"`);
      }
    }

    const painPoints = byType.get('pain_point');
    if (painPoints?.length) {
      sections.push('Pain points your audience shares:');
      for (const p of painPoints.slice(0, 3)) {
        sections.push(`  - "${p.label}"`);
      }
    }

    sections.push('Use these to make content feel targeted and relevant.');
    sections.push('===');

    return {
      prompt: sections.join('\n'),
      hasData: true,
      nodeCount: nodes.length,
    };
  } catch {
    return EMPTY;
  }
}

// ── Product Knowledge Context ──

/**
 * Returns product-specific knowledge for a given topic/product name.
 * Used when generating content about a specific product.
 */
export async function getProductKnowledgeContext(
  workspaceId: string,
  productHint: string,
): Promise<KnowledgeContext> {
  try {
    // Find matching product node
    const { data: productNodes } = await supabaseAdmin
      .from('knowledge_nodes')
      .select('id, label, metadata, confidence')
      .eq('workspace_id', workspaceId)
      .eq('node_type', 'product')
      .ilike('label', `%${productHint.slice(0, 50)}%`)
      .limit(1);

    if (!productNodes?.length) return EMPTY;

    const product = productNodes[0];

    // Find edges from this product
    const { data: edges } = await supabaseAdmin
      .from('knowledge_edges')
      .select(`
        relationship, strength,
        target:target_node_id(node_type, label, confidence)
      `)
      .eq('source_node_id', product.id)
      .order('strength', { ascending: false })
      .limit(10);

    const sections: string[] = [];
    sections.push(`=== PRODUCT KNOWLEDGE: ${product.label} ===`);

    if (edges?.length) {
      for (const e of edges) {
        const target = e.target as unknown as { node_type: string; label: string } | null;
        if (!target) continue;

        if (e.relationship === 'audience_asks') {
          sections.push(`Audience asks about this: "${target.label}"`);
        } else if (e.relationship === 'audience_objects') {
          sections.push(`Common objection: "${target.label}"`);
        } else if (e.relationship === 'converts_with') {
          sections.push(`Converts well with: ${target.label}`);
        } else if (e.relationship === 'performs_well_with') {
          sections.push(`Works well with: ${target.label} hook style`);
        }
      }
    }

    sections.push('===');

    return {
      prompt: sections.join('\n'),
      hasData: true,
      nodeCount: 1 + (edges?.length || 0),
    };
  } catch {
    return EMPTY;
  }
}

// ── Topic Knowledge Context ──

/**
 * Returns topic/trend knowledge for a given topic.
 * Used when generating content about a trending topic.
 */
export async function getTopicKnowledgeContext(
  workspaceId: string,
  topic: string,
): Promise<KnowledgeContext> {
  try {
    const { data: nodes } = await supabaseAdmin
      .from('knowledge_nodes')
      .select('node_type, label, metadata, confidence')
      .eq('workspace_id', workspaceId)
      .in('node_type', ['trend', 'topic', 'content_angle'])
      .ilike('label', `%${topic.slice(0, 50)}%`)
      .order('confidence', { ascending: false })
      .limit(5);

    if (!nodes?.length) return EMPTY;

    const sections: string[] = [];
    sections.push('=== TOPIC KNOWLEDGE ===');

    for (const n of nodes) {
      const meta = n.metadata as Record<string, unknown>;
      if (n.node_type === 'trend') {
        sections.push(`Trending: "${n.label}" (score: ${meta.trend_score || 'unknown'})`);
        if (meta.best_hook) sections.push(`  Community best hook: "${meta.best_hook}"`);
      } else {
        sections.push(`Related angle: "${n.label}"`);
      }
    }

    sections.push('===');

    return {
      prompt: sections.join('\n'),
      hasData: true,
      nodeCount: nodes.length,
    };
  } catch {
    return EMPTY;
  }
}

// ── Combined retrieval for generation ──

/**
 * Fetches all relevant knowledge context for generation in a single call.
 * Runs creator + audience queries in parallel.
 * Returns combined prompt string.
 */
export async function getGenerationKnowledgeContext(
  workspaceId: string,
  productHint?: string,
): Promise<KnowledgeContext> {
  try {
    const queries: Promise<KnowledgeContext>[] = [
      getCreatorKnowledgeContext(workspaceId),
      getAudienceKnowledgeContext(workspaceId),
    ];

    if (productHint) {
      queries.push(getProductKnowledgeContext(workspaceId, productHint));
    }

    const results = await Promise.allSettled(queries);
    const contexts = results
      .filter((r): r is PromiseFulfilledResult<KnowledgeContext> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(c => c.hasData);

    if (contexts.length === 0) return EMPTY;

    return {
      prompt: contexts.map(c => c.prompt).join('\n\n'),
      hasData: true,
      nodeCount: contexts.reduce((sum, c) => sum + c.nodeCount, 0),
    };
  } catch {
    return EMPTY;
  }
}

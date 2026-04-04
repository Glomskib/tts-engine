/**
 * Knowledge Graph types.
 *
 * Lightweight creator intelligence layer.
 * Nodes represent concepts (products, hooks, objections, etc.)
 * Edges represent relationships between them.
 */

export type NodeType =
  | 'product'
  | 'topic'
  | 'hook_style'
  | 'content_angle'
  | 'format'
  | 'objection'
  | 'pain_point'
  | 'question'
  | 'audience_trait'
  | 'cta_style'
  | 'trend';

export type RelationshipType =
  | 'performs_well_with'
  | 'audience_asks'
  | 'audience_objects'
  | 'works_for_product'
  | 'used_in_winner'
  | 'pairs_with'
  | 'converts_with'
  | 'avoids'
  | 'related_to';

export interface KnowledgeNode {
  id: string;
  workspace_id: string;
  node_type: NodeType;
  label: string;
  metadata: Record<string, unknown>;
  confidence: number;
  source: string;
  occurrences: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEdge {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  relationship: RelationshipType;
  strength: number;
  evidence_count: number;
  created_at: string;
  updated_at: string;
}

/** Context ready for injection into generation prompts */
export interface KnowledgeContext {
  prompt: string;
  hasData: boolean;
  nodeCount: number;
}

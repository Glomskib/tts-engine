-- Knowledge Graph: lightweight creator intelligence layer
-- Unifies scattered memory systems into queryable nodes + edges.
-- Source tables (content_memory, proven_hooks, etc.) remain authoritative.
-- This layer provides fast retrieval for generation prompts.

-- ── Nodes ──

create table if not exists knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  node_type text not null
    check (node_type in (
      'product', 'topic', 'hook_style', 'content_angle',
      'format', 'objection', 'pain_point', 'question',
      'audience_trait', 'cta_style', 'trend'
    )),
  label text not null,
  metadata jsonb not null default '{}',
  confidence numeric(4,2) not null default 0.5,
  source text not null default 'system',
  occurrences int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, node_type, label)
);

create index if not exists idx_kn_workspace on knowledge_nodes(workspace_id, node_type);
create index if not exists idx_kn_confidence on knowledge_nodes(workspace_id, confidence desc);

-- ── Edges ──

create table if not exists knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  source_node_id uuid not null references knowledge_nodes(id) on delete cascade,
  target_node_id uuid not null references knowledge_nodes(id) on delete cascade,
  relationship text not null
    check (relationship in (
      'performs_well_with', 'audience_asks', 'audience_objects',
      'works_for_product', 'used_in_winner', 'pairs_with',
      'converts_with', 'avoids', 'related_to'
    )),
  strength numeric(4,2) not null default 0.5,
  evidence_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, source_node_id, target_node_id, relationship)
);

create index if not exists idx_ke_source on knowledge_edges(source_node_id);
create index if not exists idx_ke_target on knowledge_edges(target_node_id);
create index if not exists idx_ke_workspace on knowledge_edges(workspace_id);

-- RLS
alter table knowledge_nodes enable row level security;
alter table knowledge_edges enable row level security;

create policy "Users manage own knowledge nodes"
  on knowledge_nodes for all
  using (workspace_id = auth.uid()::text)
  with check (workspace_id = auth.uid()::text);

create policy "Users manage own knowledge edges"
  on knowledge_edges for all
  using (workspace_id = auth.uid()::text)
  with check (workspace_id = auth.uid()::text);

/**
 * Command Center – Zod validators for key inputs.
 */
import { z } from 'zod';

// ── Usage event ingest ─────────────────────────────────────────
export const UsageEventInputSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  agent_id: z.string().min(1).default('unknown'),
  project_id: z.string().uuid().nullable().optional(),
  request_type: z.string().min(1).default('chat'),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cost_usd: z.number().min(0).optional(), // computed if missing
  latency_ms: z.number().int().min(0).nullable().optional(),
  status: z.enum(['ok', 'error']).default('ok'),
  error_code: z.string().nullable().optional(),
  correlation_id: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type UsageEventInput = z.infer<typeof UsageEventInputSchema>;

export const UsageIngestBatchSchema = z.object({
  events: z.array(UsageEventInputSchema).min(1).max(500),
});

// ── Ideas ──────────────────────────────────────────────────────
export const CreateIdeaSchema = z.object({
  title: z.string().min(1).max(500),
  prompt: z.string().max(10000).default(''),
  tags: z.array(z.string()).default([]),
  mode: z.enum(['research_only', 'research_and_plan', 'research_and_build']).default('research_only'),
  priority: z.number().int().min(1).max(5).default(3),
  created_by: z.string().nullable().optional(),
});

export type CreateIdeaInput = z.infer<typeof CreateIdeaSchema>;

export const UpdateIdeaSchema = z.object({
  status: z.enum(['inbox', 'queued', 'researching', 'researched', 'ready', 'building', 'shipped', 'killed']).optional(),
  mode: z.enum(['research_only', 'research_and_plan', 'research_and_build']).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  title: z.string().min(1).max(500).optional(),
  prompt: z.string().max(10000).optional(),
});

export type UpdateIdeaInput = z.infer<typeof UpdateIdeaSchema>;

// ── Tasks ──────────────────────────────────────────────────────
export const CreateTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).default(''),
  assigned_agent: z.string().min(1).default('unassigned'),
  status: z.enum(['queued', 'active', 'blocked', 'done', 'killed']).default('queued'),
  priority: z.number().int().min(1).max(5).default(3),
  due_at: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  status: z.enum(['queued', 'active', 'blocked', 'done', 'killed']).optional(),
  assigned_agent: z.string().min(1).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  due_at: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// ── Project events ─────────────────────────────────────────────
export const ProjectEventSchema = z.object({
  project_id: z.string().uuid().optional(),
  task_id: z.string().uuid(),
  agent_id: z.string().min(1).default('system'),
  event_type: z.enum(['created', 'claimed', 'updated', 'comment', 'status_change', 'output_link']),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type ProjectEventInput = z.infer<typeof ProjectEventSchema>;

// ── Finance ────────────────────────────────────────────────────
export const CreateFinanceTransactionSchema = z.object({
  account_id: z.string().uuid(),
  direction: z.enum(['in', 'out']),
  amount: z.number().positive(),
  category: z.string().min(1).max(100),
  vendor: z.string().max(200).nullable().optional(),
  memo: z.string().max(1000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  ts: z.string().optional(), // ISO string; defaults to now on server
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateFinanceTransactionInput = z.infer<typeof CreateFinanceTransactionSchema>;

export const CreateFinanceAccountSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['bank', 'credit', 'stripe', 'shopify', 'other']).default('bank'),
  currency: z.string().length(3).default('USD'),
});

export type CreateFinanceAccountInput = z.infer<typeof CreateFinanceAccountSchema>;

// ── Jobs ──────────────────────────────────────────────────────
export const CreateCcJobSchema = z.object({
  title: z.string().min(1).max(500),
  source_url: z.string().max(2000).nullable().optional(),
  notes: z.string().max(10000).default(''),
  status: z.enum(['lead', 'applied', 'interviewing', 'hired', 'in_progress', 'delivered', 'closed']).default('lead'),
  platform: z.enum(['upwork', 'fiverr', 'direct', 'other']).default('other'),
  hourly_rate: z.number().min(0).nullable().optional(),
  budget: z.number().min(0).nullable().optional(),
  contact: z.string().max(500).default(''),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCcJobInput = z.infer<typeof CreateCcJobSchema>;

export const UpdateCcJobSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  source_url: z.string().max(2000).nullable().optional(),
  notes: z.string().max(10000).optional(),
  status: z.enum(['lead', 'applied', 'interviewing', 'hired', 'in_progress', 'delivered', 'closed']).optional(),
  platform: z.enum(['upwork', 'fiverr', 'direct', 'other']).optional(),
  hourly_rate: z.number().min(0).nullable().optional(),
  budget: z.number().min(0).nullable().optional(),
  contact: z.string().max(500).optional(),
});

export type UpdateCcJobInput = z.infer<typeof UpdateCcJobSchema>;

// ── Projects (cc_projects) ─────────────────────────────────────
export const CreateCcProjectSchema = z.object({
  name: z.string().min(1).max(300),
  type: z.enum(['flashflow', 'ttshop', 'zebby', 'hhh', 'other']).default('other'),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
  owner: z.string().nullable().optional(),
});

export type CreateCcProjectInput = z.infer<typeof CreateCcProjectSchema>;

/**
 * CRM Pipeline – Zod validators for API inputs.
 */
import { z } from 'zod';

// ── Pipeline Stage ────────────────────────────────────────────
const PipelineStageSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  color: z.string().min(1).max(20),
  position: z.number().int().min(0),
});

// ── Pipelines ─────────────────────────────────────────────────
export const CreatePipelineSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(300),
  stages: z.array(PipelineStageSchema).min(1),
  initiative_id: z.string().uuid().nullable().optional(),
});

export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;

export const UpdatePipelineSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  stages: z.array(PipelineStageSchema).min(1).optional(),
  initiative_id: z.string().uuid().nullable().optional(),
});

export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;

// ── Contacts ──────────────────────────────────────────────────
export const CreateContactSchema = z.object({
  name: z.string().min(1).max(300),
  email: z.string().email().nullable().optional(),
  company: z.string().max(300).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  source: z.string().min(1).max(50).default('manual'),
  notes: z.string().max(10000).default(''),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateContactInput = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  email: z.string().email().nullable().optional(),
  company: z.string().max(300).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(10000).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

// ── Deals ─────────────────────────────────────────────────────
export const CreateDealSchema = z.object({
  pipeline_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(500),
  stage_key: z.string().min(1).max(50),
  value_cents: z.number().int().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(50),
  notes: z.string().max(10000).default(''),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateDealInput = z.infer<typeof CreateDealSchema>;

export const UpdateDealSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  stage_key: z.string().min(1).max(50).optional(),
  value_cents: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  sort_order: z.number().int().optional(),
  notes: z.string().max(10000).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

// ── Activities ────────────────────────────────────────────────
export const CreateActivitySchema = z.object({
  deal_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  activity_type: z.enum(['email_in', 'email_out', 'call', 'note', 'stage_change', 'meeting', 'task']),
  subject: z.string().max(500).default(''),
  body: z.string().max(50000).default(''),
  source_id: z.string().max(500).nullable().optional(),
  actor: z.string().min(1).max(100).default('admin'),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;

/**
 * Editing Engine types — instruction-driven video editing tied to content_items.
 */

import { z } from 'zod';

// ── Edit Status ──────────────────────────────────────────────────

export type EditStatus =
  | 'not_started'
  | 'planning'
  | 'ready_to_render'
  | 'rendering'
  | 'rendered'
  | 'failed';

export const EDIT_STATUSES: EditStatus[] = [
  'not_started',
  'planning',
  'ready_to_render',
  'rendering',
  'rendered',
  'failed',
];

// ── Edit Plan Actions ────────────────────────────────────────────

export const EditPlanActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cut'),
    start_sec: z.number(),
    end_sec: z.number(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('keep'),
    start_sec: z.number(),
    end_sec: z.number(),
  }),
  z.object({
    type: z.literal('text_overlay'),
    start_sec: z.number(),
    end_sec: z.number(),
    text: z.string(),
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  }),
  z.object({
    type: z.literal('broll'),
    start_sec: z.number(),
    end_sec: z.number(),
    asset_url: z.string().nullable().default(null),
    prompt: z.string().optional(),
  }),
  z.object({
    type: z.literal('speed'),
    start_sec: z.number(),
    end_sec: z.number(),
    factor: z.number().min(0.25).max(4),
  }),
]);

export type EditPlanAction = z.infer<typeof EditPlanActionSchema>;

// ── Edit Plan ────────────────────────────────────────────────────

export const EditPlanSchema = z.object({
  version: z.literal(1),
  source_duration_sec: z.number(),
  actions: z.array(EditPlanActionSchema).min(1),
  output: z.object({
    format: z.enum(['mp4', 'webm']).default('mp4'),
    resolution: z.enum(['1080x1920', '1920x1080', '720x1280']).default('1080x1920'),
    fps: z.number().default(30),
  }).default({ format: 'mp4', resolution: '1080x1920', fps: 30 }),
});

export type EditPlan = z.infer<typeof EditPlanSchema>;

// ── Content Item editing fields (mirrors DB columns) ─────────────

export interface ContentItemEditingFields {
  raw_video_url: string | null;
  raw_video_storage_path: string | null;
  editing_instructions: string | null;
  edit_plan_json: EditPlan | null;
  edit_status: EditStatus;
  rendered_video_url: string | null;
  rendered_video_storage_path: string | null;
  render_error: string | null;
  last_rendered_at: string | null;
}

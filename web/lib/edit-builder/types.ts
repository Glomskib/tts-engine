/**
 * Edit Builder — shared types + Zod schemas.
 *
 * This file is the **single source of truth** for the EditPlan shape. Both
 * the web app and the `services/edit-worker/` daemon import types from here
 * (via a relative path — the worker is a sibling package, see its README).
 *
 * Validation: API boundaries MUST parse incoming plans with `EditPlanSchema`
 * before writing them to `edit_plans.plan_json`. The worker SHOULD re-parse
 * on claim (defense in depth).
 */
import { z } from 'zod';

// ---------- constants ----------

export const ASPECT_RATIOS = ['9:16', '1:1', '16:9'] as const;
export const PROJECT_STATUSES = [
  'draft',
  'analyzing',
  'plan_ready',
  'rendering',
  'completed',
  'failed',
] as const;
export const RENDER_STATUSES = [
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export const RENDER_KINDS = ['preview', 'final'] as const;

// ---------- EditPlan ----------

export const EditSegmentSchema = z.object({
  clipId: z.string().uuid(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  transcriptText: z.string().optional(),
  subtitleText: z.string().optional(),
  emphasis: z.enum(['hook', 'proof', 'cta', 'broll']).optional(),
}).refine((s) => s.endMs > s.startMs, {
  message: 'endMs must be greater than startMs',
});

export const EditOverlaySchema = z.object({
  type: z.enum(['hook_text', 'cta_text']),
  text: z.string().min(1).max(200),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  stylePreset: z.string().default('default'),
});

export const EditCaptionsSchema = z.object({
  enabled: z.boolean(),
  stylePreset: z.string().default('default'),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  highlightKeywords: z.boolean().optional(),
});

export const EditMusicSchema = z.object({
  mode: z.enum(['none', 'library', 'upload']),
  trackId: z.string().optional(),
  volume: z.number().min(0).max(1).optional(),
});

export const EditPlanSchema = z.object({
  projectId: z.string().uuid(),
  aspectRatio: z.enum(ASPECT_RATIOS).default('9:16'),
  durationTargetSec: z.number().int().positive().optional(),
  hookText: z.string().max(200).optional(),
  captionPreset: z.string().optional(),
  music: EditMusicSchema.optional(),
  segments: z.array(EditSegmentSchema).min(1).max(64),
  captions: EditCaptionsSchema.optional(),
  overlays: z.array(EditOverlaySchema).max(16).optional(),
});

export type EditPlan = z.infer<typeof EditPlanSchema>;
export type EditSegment = z.infer<typeof EditSegmentSchema>;
export type EditOverlay = z.infer<typeof EditOverlaySchema>;
export type EditCaptions = z.infer<typeof EditCaptionsSchema>;
export type EditMusic = z.infer<typeof EditMusicSchema>;

// ---------- DB row shapes (matches 20260428000000_edit_builder_schema.sql) ----------

export interface EditProjectRow {
  id: string;
  user_id: string;
  title: string;
  status: (typeof PROJECT_STATUSES)[number];
  aspect_ratio: (typeof ASPECT_RATIOS)[number];
  target_platform: string;
  created_at: string;
  updated_at: string;
}

export interface EditSourceClipRow {
  id: string;
  edit_project_id: string;
  user_id: string;
  storage_path: string;
  duration_ms: number | null;
  transcript_status: 'pending' | 'in_progress' | 'done' | 'failed';
  analysis_status: 'pending' | 'in_progress' | 'done' | 'failed';
  sort_order: number;
  created_at: string;
}

export interface EditPlanRow {
  id: string;
  edit_project_id: string;
  user_id: string;
  version: number;
  plan_json: EditPlan;
  created_by_system: boolean;
  created_at: string;
}

export interface RenderJobRow {
  id: string;
  user_id: string;
  edit_project_id: string;
  edit_plan_id: string;
  render_kind: (typeof RENDER_KINDS)[number];
  worker_target: string | null;
  worker_id: string | null;
  status: (typeof RENDER_STATUSES)[number];
  priority: number;
  progress: number;
  attempts: number;
  max_attempts: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  output_url: string | null;
  preview_url: string | null;
  logs_json: RenderLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface RenderLogEntry {
  step: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  at?: string;
  meta?: Record<string, unknown>;
}

// ---------- helpers ----------

/**
 * Build an EditPlan from real source clips.
 *
 * Strategy: use each clip's full duration as a segment. If a clip's
 * duration_ms is unknown (null), assume 15s. Segments are capped at
 * 60s each and ordered by the input array order (which should be
 * sort_order from the DB).
 *
 * This is deliberately simple — no AI, no hook detection. The plan
 * is immediately usable for rendering: every segment references a
 * real clip ID that exists in edit_source_clips and in Storage.
 */
export function buildEditPlanFromClips(
  projectId: string,
  clips: Array<{ id: string; duration_ms: number | null }>,
): EditPlan {
  if (clips.length === 0) {
    throw new Error('Cannot generate a plan with zero clips');
  }

  const MAX_SEGMENT_MS = 60_000;
  const segments = clips.map((c) => {
    const dur = c.duration_ms ?? 15_000;
    return {
      clipId: c.id,
      startMs: 0,
      endMs: Math.max(1000, Math.min(dur, MAX_SEGMENT_MS)),
      emphasis: 'proof' as const,
    };
  });

  return {
    projectId,
    aspectRatio: '9:16',
    segments,
    captions: { enabled: true, stylePreset: 'default', position: 'bottom' },
  };
}

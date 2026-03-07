/**
 * Edit plan validation — defensive runtime checks.
 */

import { EditPlanSchema, type EditPlan } from './types';

export interface ValidationResult {
  ok: boolean;
  data?: EditPlan;
  errors?: string[];
}

/** Action types that use start_sec/end_sec timeline fields */
const TIMED_ACTIONS = new Set(['cut', 'keep', 'text_overlay', 'broll', 'speed']);

/**
 * Validate raw JSON against the EditPlan schema.
 * Returns a normalized result with structured errors.
 */
export function validateEditPlan(raw: unknown): ValidationResult {
  const result = EditPlanSchema.safeParse(raw);

  if (result.success) {
    // Extra semantic checks beyond schema shape
    const plan = result.data;
    const errors: string[] = [];

    // Actions must not overlap within the same type (except broll which overlays)
    const keeps = plan.actions.filter(a => a.type === 'keep');
    for (let i = 1; i < keeps.length; i++) {
      if (keeps[i].start_sec < keeps[i - 1].end_sec) {
        errors.push(
          `Overlapping keep segments: [${keeps[i - 1].start_sec}-${keeps[i - 1].end_sec}] and [${keeps[i].start_sec}-${keeps[i].end_sec}]`
        );
      }
    }

    // Only validate time bounds on timed actions
    for (const action of plan.actions) {
      if (!TIMED_ACTIONS.has(action.type)) continue;

      const a = action as { start_sec: number; end_sec: number; type: string };

      if (a.end_sec > plan.source_duration_sec + 0.5) {
        errors.push(
          `Action ${a.type} at ${a.start_sec}-${a.end_sec}s exceeds source duration ${plan.source_duration_sec}s`
        );
      }
      if (a.start_sec < 0) {
        errors.push(`Action ${a.type} has negative start_sec: ${a.start_sec}`);
      }
      if (a.end_sec <= a.start_sec) {
        errors.push(
          `Action ${a.type} has end_sec (${a.end_sec}) <= start_sec (${a.start_sec})`
        );
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, data: plan };
  }

  return {
    ok: false,
    errors: result.error.issues.map(
      i => `${i.path.join('.')}: ${i.message}`
    ),
  };
}

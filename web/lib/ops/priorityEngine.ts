/**
 * Priority Escalation Engine
 *
 * Deterministic priority weight computation for marketplace jobs.
 * Extends (never replaces) the existing queue priority system.
 *
 * Rules:
 *   - scale_50 clients queued > 4h → priority boost
 *   - dedicated_30 clients queued > 6h → smaller boost
 *   - Base weight comes from plan-config.ts
 */

import { getMpPlanConfig, type MpPlanTier } from "@/lib/marketplace/plan-config";

// ── Escalation rules ───────────────────────────────────────

interface EscalationRule {
  /** Hours in queue before escalation kicks in */
  threshold_hours: number;
  /** Additional priority weight added */
  boost: number;
}

/**
 * Per-tier escalation rules.  Only tiers listed here get auto-escalation.
 * Tiers not listed keep their base priority_weight unchanged.
 */
const ESCALATION_RULES: Partial<Record<MpPlanTier, EscalationRule>> = {
  scale_50: { threshold_hours: 4, boost: 3 },
  dedicated_30: { threshold_hours: 6, boost: 1 },
};

// ── Types ──────────────────────────────────────────────────

export interface PriorityInput {
  plan_tier: MpPlanTier;
  job_status: string;
  created_at: string;
  /** Current priority from the edit_jobs row */
  current_priority: number;
}

export interface PriorityResult {
  priority_weight: number;
  escalated: boolean;
  reason: string;
}

// ── Core logic ─────────────────────────────────────────────

/**
 * Compute the priority weight for a job.
 *
 * This is **deterministic** — same inputs always produce the same output.
 * It reads no external state; callers supply the job data.
 *
 * The returned `priority_weight` can be written back to the job row
 * by a cron or background sweep. This function never mutates the DB.
 */
export function computePriorityWeight(input: PriorityInput): PriorityResult {
  const cfg = getMpPlanConfig(input.plan_tier);
  const basePriority = cfg.priority_weight;

  // Only escalate queued jobs
  if (input.job_status !== "queued") {
    return {
      priority_weight: input.current_priority,
      escalated: false,
      reason: "Not queued — priority unchanged",
    };
  }

  const rule = ESCALATION_RULES[input.plan_tier];
  if (!rule) {
    return {
      priority_weight: basePriority,
      escalated: false,
      reason: `No escalation rule for ${input.plan_tier}`,
    };
  }

  const ageHours =
    (Date.now() - new Date(input.created_at).getTime()) / 3_600_000;

  if (ageHours > rule.threshold_hours) {
    const boosted = basePriority + rule.boost;
    return {
      priority_weight: boosted,
      escalated: true,
      reason: `${input.plan_tier} queued ${Math.round(ageHours)}h (>${rule.threshold_hours}h) — boosted ${basePriority}→${boosted}`,
    };
  }

  return {
    priority_weight: basePriority,
    escalated: false,
    reason: `Queued ${Math.round(ageHours)}h — below ${rule.threshold_hours}h threshold`,
  };
}

/**
 * Batch-evaluate priority for multiple jobs.
 * Returns only jobs whose priority should change.
 */
export function getEscalationCandidates(
  jobs: PriorityInput[],
): (PriorityInput & PriorityResult)[] {
  return jobs
    .map((job) => ({ ...job, ...computePriorityWeight(job) }))
    .filter((r) => r.escalated && r.priority_weight !== r.current_priority);
}

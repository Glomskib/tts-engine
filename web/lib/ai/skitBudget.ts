/**
 * Skit Intensity Budget Management
 *
 * Token bucket style budget persisted in Supabase for production safety.
 * - Capacity: 300 points
 * - Refill rate: 0.5 points/sec (300 points per 10 minutes)
 * - Cost: ceil(intensity/10) * 5 points
 *
 * When budget exceeded: clamp intensity to 30, return budget_clamped=true
 * Never throws errors - soft degradation only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Budget constants
export const BUDGET_CAPACITY = 300;
export const BUDGET_REFILL_PER_SEC = 0.5; // 300 points per 10 minutes
export const BUDGET_CLAMP_INTENSITY = 30;

/**
 * Calculate cost for a given intensity
 * ceil(intensity/10) * 5 points
 * intensity 100 = 50 points, intensity 50 = 25 points, intensity 10 = 5 points
 */
export function calculateIntensityCost(intensity: number): number {
  return Math.ceil(intensity / 10) * 5;
}

/**
 * Budget diagnostics (optional, only exposed in debug mode)
 */
export interface BudgetDiagnostics {
  budget_points_before: number;
  budget_points_after: number;
  budget_cost: number;
  budget_refilled_points: number;
  budget_capacity: number;
}

/**
 * Result of applying budget clamp
 */
export interface BudgetClampResult {
  intensityApplied: number;
  budgetClamped: boolean;
  diagnostics: BudgetDiagnostics;
}

/**
 * Apply skit budget clamp using Supabase RPC
 *
 * @param supabase - Supabase client (service role for bypassing RLS)
 * @param orgId - Organization ID
 * @param userId - User ID
 * @param intensityRequested - Requested intensity (0-100)
 * @param correlationId - For logging
 * @returns Budget clamp result with diagnostics
 */
export async function applySkitBudgetClamp({
  supabase,
  orgId,
  userId,
  intensityRequested,
  correlationId,
}: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  intensityRequested: number;
  correlationId: string;
}): Promise<BudgetClampResult> {
  const cost = calculateIntensityCost(intensityRequested);

  try {
    // Call atomic Postgres function
    const { data, error } = await supabase.rpc("apply_skit_budget", {
      p_org_id: orgId,
      p_user_id: userId,
      p_cost: cost,
      p_capacity: BUDGET_CAPACITY,
      p_refill_per_sec: BUDGET_REFILL_PER_SEC,
    });

    if (error) {
      console.error(`[${correlationId}] Budget RPC error:`, error);
      // On error, allow request but mark as unclamped (fail open)
      return {
        intensityApplied: intensityRequested,
        budgetClamped: false,
        diagnostics: {
          budget_points_before: BUDGET_CAPACITY,
          budget_points_after: BUDGET_CAPACITY,
          budget_cost: cost,
          budget_refilled_points: 0,
          budget_capacity: BUDGET_CAPACITY,
        },
      };
    }

    // RPC returns array with single row
    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      console.error(`[${correlationId}] Budget RPC returned no data`);
      return {
        intensityApplied: intensityRequested,
        budgetClamped: false,
        diagnostics: {
          budget_points_before: BUDGET_CAPACITY,
          budget_points_after: BUDGET_CAPACITY,
          budget_cost: cost,
          budget_refilled_points: 0,
          budget_capacity: BUDGET_CAPACITY,
        },
      };
    }

    const pointsBefore = Number(result.points_before);
    const pointsAfter = Number(result.points_after);
    const allowed = Boolean(result.allowed);
    const refilledPoints = Number(result.refilled_points);

    const diagnostics: BudgetDiagnostics = {
      budget_points_before: pointsBefore,
      budget_points_after: pointsAfter,
      budget_cost: cost,
      budget_refilled_points: refilledPoints,
      budget_capacity: BUDGET_CAPACITY,
    };

    if (allowed) {
      return {
        intensityApplied: intensityRequested,
        budgetClamped: false,
        diagnostics,
      };
    }

    // Budget exceeded - clamp intensity
    return {
      intensityApplied: BUDGET_CLAMP_INTENSITY,
      budgetClamped: true,
      diagnostics,
    };
  } catch (err) {
    console.error(`[${correlationId}] Budget clamp error:`, err);
    // Fail open - allow request
    return {
      intensityApplied: intensityRequested,
      budgetClamped: false,
      diagnostics: {
        budget_points_before: BUDGET_CAPACITY,
        budget_points_after: BUDGET_CAPACITY,
        budget_cost: cost,
        budget_refilled_points: 0,
        budget_capacity: BUDGET_CAPACITY,
      },
    };
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(request: Request): boolean {
  // Check URL param
  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "1") return true;

  // Check environment
  if (process.env.DEBUG_AI === "1") return true;

  return false;
}

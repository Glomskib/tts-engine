/**
 * Hook Feedback Loop Utility
 * Resolves proven_hooks from a video's selected hooks and records outcome feedback.
 * Idempotent: uses UNIQUE constraint on (hook_id, source_video_id, outcome).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { computeHookHash, HookType } from "./hook-suggestions";

export type FeedbackOutcome = "winner" | "underperform" | "rejected";

interface ResolvedHook {
  hook_id: string;
  hook_type: HookType;
  hook_text: string;
  brand_name: string;
}

interface FeedbackResult {
  ok: boolean;
  feedback_created: number;
  counts_updated: number;
  skipped_duplicate: number;
  errors: string[];
  resolved_hooks: ResolvedHook[];
}

/**
 * Resolve proven_hooks from a video's selected hooks.
 *
 * Mapping order (uses first available):
 * 1. hook_suggestions for the video (approved) → lookup proven_hooks by hook_hash + hook_type
 * 2. Fallback: compute hash from selected_*_hook fields → lookup proven_hooks
 */
export async function resolveProvenHooksFromVideo(
  supabase: SupabaseClient,
  videoId: string,
  brandName: string
): Promise<ResolvedHook[]> {
  const resolved: ResolvedHook[] = [];

  // Strategy 1: Use hook_suggestions (approved status) for this video
  const { data: suggestions } = await supabase
    .from("hook_suggestions")
    .select("hook_type, hook_hash, hook_text")
    .eq("source_video_id", videoId)
    .eq("status", "approved");

  if (suggestions && suggestions.length > 0) {
    for (const suggestion of suggestions) {
      // Find matching proven_hook by brand_name + hook_type + hook_hash
      const { data: hook } = await supabase
        .from("proven_hooks")
        .select("id, hook_type, hook_text, brand_name")
        .eq("brand_name", brandName)
        .eq("hook_type", suggestion.hook_type)
        .eq("hook_hash", suggestion.hook_hash)
        .single();

      if (hook) {
        resolved.push({
          hook_id: hook.id,
          hook_type: hook.hook_type as HookType,
          hook_text: hook.hook_text,
          brand_name: hook.brand_name,
        });
      }
    }
  }

  // If we found hooks via suggestions, return them
  if (resolved.length > 0) {
    return resolved;
  }

  // Strategy 2: Fallback - compute hash from selected_*_hook fields
  const { data: video } = await supabase
    .from("videos")
    .select("selected_spoken_hook, selected_visual_hook, selected_on_screen_hook")
    .eq("id", videoId)
    .single();

  if (!video) {
    return [];
  }

  const hookMappings: { field: keyof typeof video; hookType: HookType }[] = [
    { field: "selected_spoken_hook", hookType: "spoken" },
    { field: "selected_visual_hook", hookType: "visual" },
    { field: "selected_on_screen_hook", hookType: "text" },
  ];

  for (const mapping of hookMappings) {
    const hookText = video[mapping.field] as string | null;
    if (!hookText || !hookText.trim()) continue;

    const hookHash = computeHookHash(hookText);

    // Find matching proven_hook
    const { data: hook } = await supabase
      .from("proven_hooks")
      .select("id, hook_type, hook_text, brand_name")
      .eq("brand_name", brandName)
      .eq("hook_type", mapping.hookType)
      .eq("hook_hash", hookHash)
      .single();

    if (hook) {
      resolved.push({
        hook_id: hook.id,
        hook_type: hook.hook_type as HookType,
        hook_text: hook.hook_text,
        brand_name: hook.brand_name,
      });
    }
  }

  return resolved;
}

/**
 * Record outcome feedback for a video's hooks with idempotency.
 *
 * For each resolved hook:
 * 1. Try to insert hook_feedback (on conflict do nothing)
 * 2. If inserted, increment the corresponding count on proven_hooks
 *
 * Idempotent: calling multiple times with the same video+outcome produces no additional increments.
 */
export async function recordHookOutcome(
  supabase: SupabaseClient,
  videoId: string,
  brandName: string,
  productId: string | null,
  outcome: FeedbackOutcome,
  createdBy?: string | null
): Promise<FeedbackResult> {
  const result: FeedbackResult = {
    ok: true,
    feedback_created: 0,
    counts_updated: 0,
    skipped_duplicate: 0,
    errors: [],
    resolved_hooks: [],
  };

  // Resolve proven_hooks from video
  const resolvedHooks = await resolveProvenHooksFromVideo(supabase, videoId, brandName);
  result.resolved_hooks = resolvedHooks;

  if (resolvedHooks.length === 0) {
    // No proven hooks found - not an error, just nothing to update
    return result;
  }

  // Determine which count field to increment
  const countField = outcome === "winner"
    ? "winner_count"
    : outcome === "underperform"
    ? "underperform_count"
    : "rejected_count";

  for (const hook of resolvedHooks) {
    try {
      // Try to insert hook_feedback with source_video_id for idempotency
      // The unique index (hook_id, source_video_id, outcome) prevents duplicates
      const { data: feedback, error: insertError } = await supabase
        .from("hook_feedback")
        .insert({
          hook_id: hook.hook_id,
          brand_name: hook.brand_name,
          product_id: productId,
          outcome,
          source: "performance",
          source_video_id: videoId,
          created_by: createdBy || null,
        })
        .select("id")
        .single();

      if (insertError) {
        // Check if it's a unique violation (duplicate) - this is expected for idempotency
        if (insertError.code === "23505") {
          result.skipped_duplicate++;
          continue;
        }
        // Other errors
        result.errors.push(`${hook.hook_type}: ${insertError.message}`);
        continue;
      }

      // Feedback was inserted - now increment the count
      result.feedback_created++;

      // Get current count
      const { data: currentHook } = await supabase
        .from("proven_hooks")
        .select(countField)
        .eq("id", hook.hook_id)
        .single();

      if (currentHook) {
        const currentCount = (currentHook as Record<string, number>)[countField] || 0;
        const { error: updateError } = await supabase
          .from("proven_hooks")
          .update({ [countField]: currentCount + 1 })
          .eq("id", hook.hook_id);

        if (updateError) {
          result.errors.push(`${hook.hook_type}: Failed to update count - ${updateError.message}`);
        } else {
          result.counts_updated++;
        }
      }
    } catch (err) {
      result.errors.push(`${hook.hook_type}: ${String(err)}`);
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

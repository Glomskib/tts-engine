/**
 * Hook Usage Counts Utility
 * Increments posted_count and used_count on proven_hooks when videos are posted.
 * Idempotent: uses hook_usage_events table to prevent duplicate increments.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { computeHookHash, HookType } from "./hook-suggestions";

interface SelectedHooks {
  selected_spoken_hook?: string | null;
  selected_visual_hook?: string | null;
  selected_on_screen_hook?: string | null;
}

interface ApplyResult {
  ok: boolean;
  hooks_found: number;
  counts_incremented: number;
  skipped_duplicate: number;
  skipped_no_match: number;
  errors: string[];
}

/**
 * Apply posted count increments to proven_hooks for a video's selected hooks.
 *
 * For each selected hook:
 * 1. Compute hook_hash using the same normalization as proven_hooks
 * 2. Find matching proven_hook by brand_name + hook_type + hook_hash
 * 3. Try to insert hook_usage_events (on conflict do nothing)
 * 4. If inserted, increment posted_count and used_count on proven_hooks
 *
 * Idempotent: calling multiple times for the same video produces no additional increments.
 *
 * @param supabaseAdmin - Supabase admin client (service role)
 * @param videoId - Source video ID
 * @param selectedHooks - The video's selected hook fields
 * @param brandName - Brand name for lookup
 */
export async function applyHookPostedCounts(
  supabaseAdmin: SupabaseClient,
  videoId: string,
  selectedHooks: SelectedHooks,
  brandName: string
): Promise<ApplyResult> {
  const result: ApplyResult = {
    ok: true,
    hooks_found: 0,
    counts_incremented: 0,
    skipped_duplicate: 0,
    skipped_no_match: 0,
    errors: [],
  };

  // Map selected_* fields to hook_type (matching proven_hooks.hook_type)
  const hookMappings: { field: keyof SelectedHooks; hookType: HookType }[] = [
    { field: "selected_spoken_hook", hookType: "spoken" },
    { field: "selected_visual_hook", hookType: "visual" },
    { field: "selected_on_screen_hook", hookType: "text" },
  ];

  for (const mapping of hookMappings) {
    const hookText = selectedHooks[mapping.field];

    // Skip empty hooks
    if (!hookText || typeof hookText !== "string" || !hookText.trim()) {
      continue;
    }

    // Compute hash using the same normalization as proven_hooks
    const hookHash = computeHookHash(hookText);

    try {
      // Find matching proven_hook by brand_name + hook_type + hook_hash
      const { data: provenHook, error: lookupError } = await supabaseAdmin
        .from("proven_hooks")
        .select("id, posted_count, used_count")
        .eq("brand_name", brandName)
        .eq("hook_type", mapping.hookType)
        .eq("hook_hash", hookHash)
        .single();

      if (lookupError) {
        // PGRST116 = no rows found - not an error, just no matching proven_hook
        if (lookupError.code === "PGRST116") {
          result.skipped_no_match++;
          continue;
        }
        result.errors.push(`${mapping.hookType}: lookup error - ${lookupError.message}`);
        continue;
      }

      if (!provenHook) {
        result.skipped_no_match++;
        continue;
      }

      result.hooks_found++;

      // Try to insert hook_usage_events for idempotency
      // ON CONFLICT DO NOTHING prevents duplicate increments
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("hook_usage_events")
        .insert({
          hook_id: provenHook.id,
          source_video_id: videoId,
          event_type: "posted",
        })
        .select("id")
        .single();

      if (insertError) {
        // Check if it's a unique violation (duplicate) - expected for idempotency
        if (insertError.code === "23505") {
          result.skipped_duplicate++;
          continue;
        }
        result.errors.push(`${mapping.hookType}: insert error - ${insertError.message}`);
        continue;
      }

      // Insert succeeded - increment counts
      const newPostedCount = (provenHook.posted_count || 0) + 1;
      const newUsedCount = (provenHook.used_count || 0) + 1;

      const { error: updateError } = await supabaseAdmin
        .from("proven_hooks")
        .update({
          posted_count: newPostedCount,
          used_count: newUsedCount,
        })
        .eq("id", provenHook.id);

      if (updateError) {
        result.errors.push(`${mapping.hookType}: update error - ${updateError.message}`);
        continue;
      }

      result.counts_incremented++;
    } catch (err) {
      result.errors.push(`${mapping.hookType}: ${String(err)}`);
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

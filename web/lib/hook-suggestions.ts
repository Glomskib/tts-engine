/**
 * Hook Suggestions Utility
 * Creates suggestions from selected hooks when videos are posted.
 * Idempotent: uses UNIQUE constraint to prevent duplicates.
 */

import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";

export type HookType = "spoken" | "visual" | "text";

export interface HookSuggestionInput {
  source_video_id: string;
  product_id?: string | null;
  brand_name?: string | null;
  hook_type: HookType;
  hook_text: string;
}

export interface CreateSuggestionsResult {
  ok: boolean;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Compute hook hash for deduplication.
 * Matches the hash function used in proven_hooks.
 */
export function computeHookHash(text: string): string {
  return crypto
    .createHash("md5")
    .update(text.toLowerCase().trim())
    .digest("hex");
}

/**
 * Normalize hook text for storage.
 */
function normalizeHookText(text: string): string {
  return text.trim();
}

/**
 * Create hook suggestions from a video's selected hooks.
 * Idempotent: duplicates are silently skipped via ON CONFLICT DO NOTHING.
 *
 * @param supabase - Supabase admin client (service role)
 * @param videoId - Source video ID
 * @param selectedHooks - Map of hook_type to hook_text
 * @param productId - Optional product ID
 * @param brandName - Optional brand name
 */
export async function createHookSuggestions(
  supabase: SupabaseClient,
  videoId: string,
  selectedHooks: Record<string, string | null | undefined>,
  productId?: string | null,
  brandName?: string | null
): Promise<CreateSuggestionsResult> {
  const result: CreateSuggestionsResult = {
    ok: true,
    created: 0,
    skipped: 0,
    errors: [],
  };

  // Map selected_* fields to hook_type
  const hookMappings: { field: string; hookType: HookType }[] = [
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

    const normalized = normalizeHookText(hookText);
    const hookHash = computeHookHash(normalized);

    try {
      // Use upsert with ON CONFLICT DO NOTHING for idempotency
      const { error } = await supabase
        .from("hook_suggestions")
        .upsert(
          {
            source_video_id: videoId,
            product_id: productId || null,
            brand_name: brandName || null,
            hook_type: mapping.hookType,
            hook_text: normalized,
            hook_hash: hookHash,
            status: "pending",
          },
          {
            onConflict: "source_video_id,hook_type,hook_hash",
            ignoreDuplicates: true,
          }
        );

      if (error) {
        // Unique violation is expected for duplicates - count as skipped
        if (error.code === "23505") {
          result.skipped++;
        } else {
          result.errors.push(`${mapping.hookType}: ${error.message}`);
        }
      } else {
        result.created++;
      }
    } catch (err) {
      result.errors.push(`${mapping.hookType}: ${String(err)}`);
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

/**
 * Create hook suggestions from video data.
 * Convenience wrapper that extracts selected hooks from video record.
 */
export async function createHookSuggestionsFromVideo(
  supabase: SupabaseClient,
  video: {
    id: string;
    product_id?: string | null;
    selected_spoken_hook?: string | null;
    selected_visual_hook?: string | null;
    selected_on_screen_hook?: string | null;
  },
  brandName?: string | null
): Promise<CreateSuggestionsResult> {
  return createHookSuggestions(
    supabase,
    video.id,
    {
      selected_spoken_hook: video.selected_spoken_hook,
      selected_visual_hook: video.selected_visual_hook,
      selected_on_screen_hook: video.selected_on_screen_hook,
    },
    video.product_id,
    brandName
  );
}

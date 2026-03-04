/**
 * Hook Extractor — detects and stores hook patterns from postmortem analysis.
 *
 * When a postmortem has hook_strength >= 7, extracts the pattern and stores
 * it in hook_patterns for reuse in future brief generation.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { PostmortemJSON } from '@/lib/ai/postmortem/generatePostmortem';

const HOOK_STRENGTH_THRESHOLD = 7;

/**
 * Extract and store a hook pattern from a postmortem if hook_strength meets threshold.
 * Returns the hook pattern ID if inserted, null otherwise.
 */
export async function extractHookPattern(
  postId: string,
  workspaceId: string,
  postmortem: PostmortemJSON,
): Promise<{ id: string } | null> {
  if (postmortem.hook_analysis.hook_strength < HOOK_STRENGTH_THRESHOLD) {
    return null;
  }

  const pattern = postmortem.hook_analysis.pattern_detected;
  if (!pattern) return null;

  // Check for duplicate pattern in workspace (avoid spamming same pattern)
  const { data: existing } = await supabaseAdmin
    .from('hook_patterns')
    .select('id, performance_score')
    .eq('workspace_id', workspaceId)
    .ilike('pattern', pattern)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update performance score if this instance scored higher
    const newScore = postmortem.hook_analysis.hook_strength;
    if (newScore > (existing.performance_score ?? 0)) {
      await supabaseAdmin
        .from('hook_patterns')
        .update({ performance_score: newScore })
        .eq('id', existing.id);
    }
    return { id: existing.id };
  }

  // Insert new hook pattern
  const { data: hookPattern, error } = await supabaseAdmin
    .from('hook_patterns')
    .insert({
      workspace_id: workspaceId,
      pattern,
      example_hook: postmortem.what_worked[0] || pattern,
      performance_score: postmortem.hook_analysis.hook_strength,
      source_post_id: postId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[hookExtractor] insert error:', error);
    return null;
  }

  return hookPattern;
}

/**
 * Fetch top-performing hook patterns for a workspace.
 * Used in brief generation to provide "winning hooks" context.
 */
export async function fetchTopHookPatterns(
  workspaceId: string,
  limit = 5,
): Promise<Array<{ pattern: string; example_hook: string | null; performance_score: number }>> {
  const { data, error } = await supabaseAdmin
    .from('hook_patterns')
    .select('pattern, example_hook, performance_score')
    .eq('workspace_id', workspaceId)
    .order('performance_score', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

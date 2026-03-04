/**
 * Content Memory Updater — extracts learnings from postmortems and
 * winner evaluations, upserts into content_memory table.
 *
 * Called after postmortem generation and winner detection.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { PostmortemJSON } from '@/lib/ai/postmortem/generatePostmortem';

const LOG = '[memoryUpdater]';

interface MemoryEntry {
  workspace_id: string;
  memory_type: 'hook' | 'format' | 'product' | 'pattern';
  value: string;
  performance_score: number;
}

/**
 * Extract memory entries from a postmortem and upsert into content_memory.
 * Each entry's performance_score is averaged with existing occurrences.
 */
export async function updateMemoryFromPostmortem(
  workspaceId: string,
  postmortem: PostmortemJSON,
  productName?: string | null,
): Promise<void> {
  const entries: MemoryEntry[] = [];
  const engRate = postmortem.engagement_analysis.engagement_rate;

  // Hook pattern memory
  if (postmortem.hook_analysis.pattern_detected) {
    entries.push({
      workspace_id: workspaceId,
      memory_type: 'hook',
      value: postmortem.hook_analysis.pattern_detected.toLowerCase().trim(),
      performance_score: postmortem.hook_analysis.hook_strength,
    });
  }

  // Pattern memory from what_worked items
  for (const item of postmortem.what_worked) {
    if (item.length > 3 && item.length < 100) {
      entries.push({
        workspace_id: workspaceId,
        memory_type: 'pattern',
        value: item.toLowerCase().trim(),
        performance_score: engRate,
      });
    }
  }

  // Product memory
  if (productName) {
    entries.push({
      workspace_id: workspaceId,
      memory_type: 'product',
      value: productName.toLowerCase().trim(),
      performance_score: engRate,
    });
  }

  await upsertMemoryEntries(entries);
}

/**
 * Upsert memory entries. On conflict, updates performance_score as a
 * running average and increments occurrences.
 */
async function upsertMemoryEntries(entries: MemoryEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!entry.value) continue;

    // Check if exists
    const { data: existing } = await supabaseAdmin
      .from('content_memory')
      .select('id, performance_score, occurrences')
      .eq('workspace_id', entry.workspace_id)
      .eq('memory_type', entry.memory_type)
      .eq('value', entry.value)
      .maybeSingle();

    if (existing) {
      // Running average: ((old * count) + new) / (count + 1)
      const newOccurrences = existing.occurrences + 1;
      const newScore = ((existing.performance_score * existing.occurrences) + entry.performance_score) / newOccurrences;

      const { error } = await supabaseAdmin
        .from('content_memory')
        .update({
          performance_score: Math.round(newScore * 100) / 100,
          occurrences: newOccurrences,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) console.error(`${LOG} update error:`, error);
    } else {
      const { error } = await supabaseAdmin
        .from('content_memory')
        .insert({
          workspace_id: entry.workspace_id,
          memory_type: entry.memory_type,
          value: entry.value,
          performance_score: Math.round(entry.performance_score * 100) / 100,
          occurrences: 1,
        });

      if (error) console.error(`${LOG} insert error:`, error);
    }
  }
}

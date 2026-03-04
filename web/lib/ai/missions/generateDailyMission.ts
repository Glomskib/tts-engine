/**
 * Daily Mission Generator
 *
 * Assembles a daily task list for creators from database queries.
 * No AI calls — pure data-driven mission structure.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface MissionTask {
  id: string;
  title: string;
  product_name: string | null;
  content_item_id?: string;
  hook_pattern_id?: string;
  hook_text?: string;
}

export interface DailyMission {
  record_tasks: MissionTask[];
  post_tasks: MissionTask[];
  experiment_tasks: MissionTask[];
  generated_at: string;
}

export async function generateDailyMission(workspaceId: string): Promise<DailyMission> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [recordResult, postResult, experimentResult] = await Promise.all([
    // record_tasks: ready_to_record, ordered by due_at asc
    supabaseAdmin
      .from('content_items')
      .select('id, title, short_id, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_record')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(2),

    // post_tasks: ready_to_post, ordered by due_at asc
    supabaseAdmin
      .from('content_items')
      .select('id, title, short_id, products:product_id(name)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready_to_post')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(2),

    // experiment_tasks: top hook patterns not used recently
    supabaseAdmin
      .from('hook_patterns')
      .select('id, pattern, example_hook, performance_score, uses_count')
      .eq('workspace_id', workspaceId)
      .or(`last_used_at.is.null,last_used_at.lt.${sevenDaysAgo}`)
      .order('performance_score', { ascending: false })
      .order('uses_count', { ascending: true })
      .limit(1),
  ]);

  const recordTasks: MissionTask[] = (recordResult.data || []).map((item: any) => ({
    id: item.id,
    title: item.title,
    product_name: item.products?.name ?? null,
    content_item_id: item.id,
  }));

  const postTasks: MissionTask[] = (postResult.data || []).map((item: any) => ({
    id: item.id,
    title: item.title,
    product_name: item.products?.name ?? null,
    content_item_id: item.id,
  }));

  const experimentTasks: MissionTask[] = (experimentResult.data || []).map((hp: any) => ({
    id: hp.id,
    title: `Try: "${hp.example_hook || hp.pattern}"`,
    product_name: null,
    hook_pattern_id: hp.id,
    hook_text: hp.example_hook || hp.pattern,
  }));

  return {
    record_tasks: recordTasks,
    post_tasks: postTasks,
    experiment_tasks: experimentTasks,
    generated_at: new Date().toISOString(),
  };
}

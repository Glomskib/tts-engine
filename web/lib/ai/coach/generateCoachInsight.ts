/**
 * AI Coach Insight Generator
 *
 * Produces a single actionable insight per day based on workspace data.
 * No AI calls — rule-based logic over database queries.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface CoachInsight {
  message: string;
  type: 'post_reminder' | 'hook_variation' | 'winner_replication' | 'general';
}

export async function generateCoachInsight(workspaceId: string): Promise<CoachInsight> {
  // Check for items ready to post
  const { count: readyToPostCount } = await supabaseAdmin
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'ready_to_post');

  if (readyToPostCount && readyToPostCount > 0) {
    return {
      message: `You have ${readyToPostCount} video${readyToPostCount > 1 ? 's' : ''} ready to post today. Don't let them sit!`,
      type: 'post_reminder',
    };
  }

  // Check for repeated hook usage (same pattern used 3+ times recently)
  const { data: recentItems } = await supabaseAdmin
    .from('content_items')
    .select('title')
    .eq('workspace_id', workspaceId)
    .in('status', ['posted', 'ready_to_post', 'ready_to_record'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentItems && recentItems.length >= 3) {
    // Simple duplicate title-word detection
    const titleWords = recentItems.map((i: any) => i.title?.toLowerCase().split(' ').slice(0, 3).join(' ')).filter(Boolean);
    const freq: Record<string, number> = {};
    for (const w of titleWords) {
      freq[w] = (freq[w] || 0) + 1;
    }
    const repeated = Object.entries(freq).find(([, count]) => count >= 3);
    if (repeated) {
      // Suggest a top hook pattern as variation
      const { data: topHook } = await supabaseAdmin
        .from('hook_patterns')
        .select('example_hook, pattern')
        .eq('workspace_id', workspaceId)
        .order('performance_score', { ascending: false })
        .limit(1)
        .single();

      const suggestion = topHook?.example_hook || topHook?.pattern || 'a pocket reveal';
      return {
        message: `Your last few videos used similar hooks. Try variation: ${suggestion}`,
        type: 'hook_variation',
      };
    }
  }

  // Check for recent winners
  const { data: winners } = await supabaseAdmin
    .from('content_items')
    .select('title, products:product_id(name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .not('ai_description', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (winners && winners.length > 0) {
    const w: any = winners[0];
    const productName = w.products?.name || 'your top product';
    return {
      message: `Your ${productName} content is performing well. Try filming 2 more variations today.`,
      type: 'winner_replication',
    };
  }

  return {
    message: 'Keep creating! Consistency is your biggest advantage.',
    type: 'general',
  };
}

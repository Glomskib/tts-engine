/**
 * Orchestrator: generate viral playbook and store in content_item_ai_insights.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generatePlaybook } from './generatePlaybook';
import type { PostmortemJSON } from '@/lib/ai/postmortem/generatePostmortem';

interface StorePlaybookInput {
  postId: string;
  contentItemId: string;
  workspaceId: string;
  postmortem: PostmortemJSON;
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
  };
  correlationId?: string;
}

export async function generateAndStorePlaybook(input: StorePlaybookInput): Promise<void> {
  // Resolve product name if post has a product_id
  let productName: string | null = null;
  const { data: postRow } = await supabaseAdmin
    .from('content_item_posts')
    .select('product_id')
    .eq('id', input.postId)
    .maybeSingle();

  if (postRow?.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', postRow.product_id)
      .maybeSingle();
    productName = product?.name ?? null;
  }

  const playbook = await generatePlaybook({
    postmortem: {
      summary: input.postmortem.summary,
      what_worked: input.postmortem.what_worked,
      hook_analysis: input.postmortem.hook_analysis,
      engagement_analysis: input.postmortem.engagement_analysis,
    },
    metrics: input.metrics,
    hookPattern: input.postmortem.hook_analysis.pattern_detected,
    productName,
    correlationId: input.correlationId,
  });

  const { error } = await supabaseAdmin
    .from('content_item_ai_insights')
    .insert({
      workspace_id: input.workspaceId,
      content_item_id: input.contentItemId,
      content_item_post_id: input.postId,
      insight_type: 'viral_playbook',
      json: playbook,
    });

  if (error) {
    console.error('[viral-playbook] insert error:', error);
  }
}

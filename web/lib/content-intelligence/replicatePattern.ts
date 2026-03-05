/**
 * Pattern Replication Engine
 *
 * Given a winning pattern, generates multiple new content items
 * with varied hooks, openings, and CTAs while preserving the
 * winning structure (format, length, product).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface ReplicationResult {
  replication_id: string;
  content_items_created: number;
  items: Array<{ id: string; title: string }>;
}

interface PatternData {
  id: string;
  workspace_id: string;
  platform: string;
  product_id: string | null;
  hook_text: string | null;
  format_tag: string | null;
  length_bucket: string | null;
  cta_tag: string | null;
  score: number;
}

/**
 * Generate hook variations from a source hook.
 * Uses simple pattern-based variation to avoid needing an LLM call.
 */
function generateHookVariations(hookText: string | null, count: number): string[] {
  if (!hookText) {
    return Array.from({ length: count }, (_, i) => `Hook variation ${i + 1}`);
  }

  const hook = hookText.trim();
  const prefixes = [
    'Nobody talks about',
    'Most people don\'t realize',
    'I didn\'t believe',
    'This surprised me about',
    'The truth about',
    'What nobody tells you about',
    'Why everyone is wrong about',
    'I was shocked when I learned',
    'Stop scrolling if you',
    'Here\'s what changed everything about',
    'The secret behind',
    'You won\'t believe what happens when',
  ];

  // Extract the core topic from the hook
  const coreTopic = extractCoreTopic(hook);
  const variations: string[] = [];

  // Shuffle prefixes and build variations
  const shuffled = [...prefixes].sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    const prefix = shuffled[i % shuffled.length];
    if (coreTopic) {
      variations.push(`${prefix} ${coreTopic}`);
    } else {
      // Rephrase by rotating words
      const words = hook.split(/\s+/);
      const rotated = [...words.slice(i % Math.max(1, words.length - 2)), ...words.slice(0, i % Math.max(1, words.length - 2))];
      variations.push(rotated.join(' '));
    }
  }

  return variations;
}

/**
 * Extract the core topic from a hook text.
 */
function extractCoreTopic(hook: string): string | null {
  // Remove common hook prefixes to find the topic
  const patterns = [
    /^(?:nobody talks about|most people don't realize|i didn't believe|this surprised me about|the truth about|what nobody tells you about|pov:?\s*)/i,
    /^(?:stop scrolling if you|here's what|the secret behind|you won't believe)/i,
  ];

  let topic = hook;
  for (const p of patterns) {
    topic = topic.replace(p, '').trim();
  }

  // If we stripped something meaningful, return the topic
  if (topic.length > 0 && topic.length < hook.length) {
    return topic;
  }

  // Fallback: take last 60% of the hook as the topic
  const words = hook.split(/\s+/);
  if (words.length >= 4) {
    return words.slice(Math.floor(words.length * 0.4)).join(' ');
  }

  return null;
}

/**
 * Generate CTA variations.
 */
function generateCTAVariations(count: number): string[] {
  const ctas = [
    'Link in bio for more',
    'Follow for part 2',
    'Save this for later',
    'Comment if you agree',
    'Share with someone who needs this',
    'Try it and let me know',
    'Drop a comment below',
    'Follow for daily tips',
    'Link in bio to learn more',
    'Tag someone who needs to see this',
  ];
  const shuffled = [...ctas].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Replicate a winning pattern into multiple new content items.
 */
export async function replicatePattern(
  workspaceId: string,
  patternId: string,
  count: number = 5,
): Promise<ReplicationResult> {
  // 1. Fetch the pattern
  const { data: pattern, error: patternError } = await supabaseAdmin
    .from('winner_patterns_v2')
    .select('*')
    .eq('id', patternId)
    .eq('workspace_id', workspaceId)
    .single();

  if (patternError || !pattern) {
    throw new Error('Pattern not found');
  }

  const p = pattern as unknown as PatternData;

  // 2. Fetch product name if linked
  let productName = 'Unknown Product';
  if (p.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('id', p.product_id)
      .single();
    if (product) productName = product.name;
  }

  // 3. Generate variations
  const hookVariations = generateHookVariations(p.hook_text, count);
  const ctaVariations = generateCTAVariations(count);

  // 4. Create replication record
  const { data: replication, error: repError } = await supabaseAdmin
    .from('content_replications')
    .insert({
      workspace_id: workspaceId,
      pattern_id: patternId,
      replication_count: count,
    })
    .select('id')
    .single();

  if (repError || !replication) {
    throw new Error('Failed to create replication record');
  }

  // 5. Create content items
  const createdItems: Array<{ id: string; title: string }> = [];

  for (let i = 0; i < count; i++) {
    const hook = hookVariations[i];
    const cta = ctaVariations[i];
    const title = `${productName} — ${hook.slice(0, 50)}${hook.length > 50 ? '...' : ''}`;

    const { data: item, error: itemError } = await supabaseAdmin
      .from('content_items')
      .insert({
        workspace_id: workspaceId,
        title,
        product_id: p.product_id,
        status: 'briefing',
        pattern_id: patternId,
        generated_from_pattern: true,
        short_id: 'temp', // Overridden by DB trigger
        notes: JSON.stringify({
          source: 'pattern_replication',
          replication_id: replication.id,
          pattern_score: p.score,
          hook,
          format: p.format_tag,
          length: p.length_bucket,
          platform: p.platform,
          cta,
        }),
      })
      .select('id, title')
      .single();

    if (!itemError && item) {
      createdItems.push({ id: item.id, title: item.title });
    }
  }

  return {
    replication_id: replication.id,
    content_items_created: createdItems.length,
    items: createdItems,
  };
}

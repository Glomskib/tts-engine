#!/usr/bin/env npx ts-node
/**
 * Daily Content Autopilot
 * Designed to run via OpenClaw cron or manual trigger
 *
 * Pipeline:
 * 1. Fetch user's active products and brands
 * 2. Check winners bank for top-performing patterns
 * 3. Generate 3 content ideas with full hooks
 * 4. Save to posting_queue as drafts
 * 5. Send summary via API (for Telegram notification)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string | null;
}

interface Winner {
  hook: string;
  hook_type: string | null;
  content_format: string | null;
  rating: number;
}

interface PainPoint {
  pain_point_text: string;
  category: string | null;
  times_used: number;
}

interface ContentIdea {
  product_name: string;
  product_id: string;
  platform: string;
  angle: string;
  hook: string;
  caption: string;
  hashtags: string[];
}

function buildAutopilotPrompt(
  products: Product[],
  winners: Winner[],
  painPoints: PainPoint[]
): string {
  const productList = products.map(p => `- ${p.name} (${p.brand}, ${p.category || 'uncategorized'})`).join('\n');
  const winnerPatterns = winners.map(w => `- ${w.hook_type || 'unknown'}: "${w.hook.slice(0, 100)}..." (rating: ${w.rating}/10)`).join('\n');
  const painPointsList = painPoints.slice(0, 10).map(pp => `- ${pp.pain_point_text}`).join('\n');

  return `You are a TikTok Shop content strategist. Generate 3 content ideas for today based on this creator's data.

ACTIVE PRODUCTS:
${productList || '(none)'}

TOP PERFORMING PATTERNS (from Winners Bank):
${winnerPatterns || '(no data yet)'}

TOP PAIN POINTS (customer problems to address):
${painPointsList || '(none saved)'}

Generate 3 content ideas. For each:
1. Pick a product from the list (or suggest "General niche content" if no products)
2. Choose the best platform (TikTok, YouTube Shorts, or Instagram Reels)
3. Create a content angle/approach
4. Write a scroll-stopping hook
5. Write a caption (under 150 chars)
6. Suggest 5-7 relevant hashtags

Return as JSON array:
[
  {
    "product_name": "Product X",
    "product_id": "uuid or null",
    "platform": "tiktok",
    "angle": "POV: You finally found the solution to [pain point]",
    "hook": "Wait... this actually works?!",
    "caption": "I was skeptical at first but now I can't live without this 🤯",
    "hashtags": ["#tiktokmademebuyit", "#productname", "#niche"]
  }
]`;
}

async function generateWithAI(prompt: string): Promise<ContentIdea[]> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250315',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';

  // Try to extract JSON
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('Failed to parse AI response');
}

export async function runAutopilot(userId: string) {
  console.log(`[autopilot] Running for user ${userId}...`);

  // Step 1: Get active products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, brand, category')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(10);

  console.log(`[autopilot] Found ${products?.length || 0} active products`);

  // Step 2: Get winning patterns
  const { data: winners } = await supabase
    .from('winners_bank')
    .select('hook, hook_type, content_format, rating')
    .eq('user_id', userId)
    .order('rating', { ascending: false })
    .limit(5);

  console.log(`[autopilot] Found ${winners?.length || 0} winning patterns`);

  // Step 3: Get pain points for top products
  const { data: painPoints } = await supabase
    .from('saved_pain_points')
    .select('pain_point_text, category, times_used')
    .eq('user_id', userId)
    .order('times_used', { ascending: false })
    .limit(20);

  console.log(`[autopilot] Found ${painPoints?.length || 0} pain points`);

  // Step 4: Call AI to generate ideas
  const prompt = buildAutopilotPrompt(
    products || [],
    winners || [],
    painPoints || []
  );

  console.log('[autopilot] Generating content ideas with AI...');
  const ideas = await generateWithAI(prompt);
  console.log(`[autopilot] Generated ${ideas.length} content ideas`);

  // Step 5: Save as drafts in posting queue
  for (const idea of ideas) {
    const { error } = await supabase.from('posting_queue').insert({
      user_id: userId,
      platform: idea.platform,
      status: 'draft',
      caption: idea.caption,
      hashtags: idea.hashtags,
      platform_metadata: {
        content_idea: idea.angle,
        suggested_hook: idea.hook,
        product_id: idea.product_id,
        auto_generated: true,
        generated_at: new Date().toISOString(),
      },
    });

    if (error) {
      console.error(`[autopilot] Failed to save idea:`, error);
    }
  }

  console.log(`[autopilot] Saved ${ideas.length} drafts to posting_queue`);

  // Step 6: Return summary for notification
  return {
    count: ideas.length,
    ideas: ideas.map(i => ({
      product: i.product_name,
      angle: i.angle,
      platform: i.platform,
    })),
  };
}

// CLI execution
if (require.main === module) {
  const userId = process.argv[2];
  
  if (!userId) {
    console.error('Usage: npx ts-node scripts/autopilot/daily-content-ideas.ts <user_id>');
    process.exit(1);
  }

  runAutopilot(userId)
    .then(result => {
      console.log('\n✅ Autopilot Complete!');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('\n❌ Autopilot Failed:', error.message);
      process.exit(1);
    });
}

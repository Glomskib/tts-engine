#!/usr/bin/env tsx
/**
 * Cycling Content Agent — reads today's cycling intel from MC,
 * generates 5 platform-specific drafts via Claude Haiku, posts back to MC.
 *
 * Usage:
 *   pnpm run job:cycling-agent
 *   pnpm run job:cycling-agent:dry
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { CyclingDraft, SocialDraft } from '../lib/types';
import { getTodayIntelDoc } from '../lib/mc-reader';
import { callHaikuJSON } from '../lib/haiku-client';
import { postToMC } from '../lib/mc-poster';
import { pushToBuffer } from '../lib/buffer-client';

const TAG = '[cycling-agent]';
const LANE = 'Making Miles Matter';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const SYSTEM_PROMPT = `You are a social media content creator for "Making Miles Matter," a cycling brand that celebrates cycling culture, community rides, and the transformative power of getting on a bike.

Brand voice: Energetic, inclusive, celebrates all levels of cycling. Use "we" language. Avoid gatekeeping or elitism.

You will receive today's cycling intel report. Create exactly 5 social media drafts, one for each platform:
1. Twitter/X — punchy, under 280 chars
2. Instagram — storytelling caption, 2-3 paragraphs
3. LinkedIn — professional thought-leadership, 1-2 paragraphs
4. Facebook — conversational community post, 1-2 paragraphs
5. Threads — casual and engaging, 1-2 short paragraphs

Respond with a JSON array of 5 objects. Each object must have:
- "platform": the platform name
- "caption": the full post text
- "hashtags": array of relevant hashtag strings (without #)
- "hook": a one-line attention grabber
- "cta": optional call-to-action string (can be null)

Return ONLY the JSON array, no other text.`;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const date = todayDate();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${TAG} ERROR: ANTHROPIC_API_KEY not set`);
    process.exit(1);
  }

  // 1. Read today's intel from MC
  console.log(`${TAG} Reading today's intel doc for "${LANE}"...`);
  const intelDoc = await getTodayIntelDoc(LANE);
  if (!intelDoc) {
    console.error(`${TAG} No intel doc found for ${LANE} on ${date}. Run daily-intel first.`);
    process.exit(1);
  }
  console.log(`${TAG} Found intel doc: "${intelDoc.title}" (${intelDoc.content.length} chars)`);

  // 2. Generate 5 drafts via Haiku
  console.log(`${TAG} Generating 5 cycling drafts...`);
  const drafts = await callHaikuJSON<CyclingDraft[]>(
    SYSTEM_PROMPT,
    `Here is today's cycling intel report:\n\n${intelDoc.content}`,
    { maxTokens: 4096 },
  );
  console.log(`${TAG} Generated ${drafts.length} drafts`);

  // 3. Format as markdown for MC
  const markdown = drafts.map((d, i) => {
    const hashtags = d.hashtags.map(h => `#${h}`).join(' ');
    return `## ${i + 1}. ${d.platform}\n\n**Hook:** ${d.hook}\n\n${d.caption}\n\n**Hashtags:** ${hashtags}${d.cta ? `\n\n**CTA:** ${d.cta}` : ''}`;
  }).join('\n\n---\n\n');

  if (dryRun) {
    console.log(`${TAG} DRY RUN — preview:\n`);
    console.log(markdown);
    console.log(`\n${TAG} Done (dry run).`);
    return;
  }

  // 4. Post to MC
  console.log(`${TAG} Posting drafts to Mission Control...`);
  const mcResult = await postToMC({
    title: `Cycling Agent Drafts — ${date}`,
    content: markdown,
    category: 'drafts',
    lane: LANE,
    tags: ['agent-drafts', 'cycling'],
  });
  if (mcResult.ok) {
    console.log(`${TAG} MC doc posted: ${mcResult.id}`);
  } else {
    console.error(`${TAG} MC post failed: ${mcResult.error}`);
  }

  // 5. Optional: push to Buffer
  if (process.env.BUFFER_ACCESS_TOKEN) {
    console.log(`${TAG} Pushing to Buffer...`);
    const socialDrafts: SocialDraft[] = drafts.map(d => ({
      platform: d.platform,
      content: `${d.caption}\n\n${d.hashtags.map(h => `#${h}`).join(' ')}`,
    }));
    const bufResult = await pushToBuffer(socialDrafts);
    console.log(`${TAG} Buffer: ${bufResult.pushed} posts queued`);
  }

  console.log(`${TAG} Done.`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});

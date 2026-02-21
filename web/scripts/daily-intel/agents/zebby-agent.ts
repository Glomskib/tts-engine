#!/usr/bin/env tsx
/**
 * Zebby's World Content Agent — reads today's EDS intel from MC,
 * loads the zebby style guide, generates 3 scene-based drafts via Haiku.
 *
 * Usage:
 *   pnpm run job:zebby-agent
 *   pnpm run job:zebby-agent:dry
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ZebbyDraft } from '../lib/types';
import { getTodayIntelDoc } from '../lib/mc-reader';
import { callHaikuJSON } from '../lib/haiku-client';
import { postToMC } from '../lib/mc-poster';

const TAG = '[zebby-agent]';
const LANE = "Zebby's World";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStyleGuide(): string {
  const stylePath = resolve(__dirname, '../../../prompts/zebby_style.md');
  return readFileSync(stylePath, 'utf-8');
}

function buildSystemPrompt(styleGuide: string): string {
  return `You are a content creator for "Zebby's World," a brand dedicated to EDS (Ehlers-Danlos Syndrome), POTS, and dysautonomia awareness through lovable animated characters.

${styleGuide}

IMPORTANT CONTENT GUARDRAILS:
- NEVER provide medical advice or suggest treatments
- NEVER suggest diagnosis or diagnostic criteria
- Always use language like "research suggests" or "studies indicate"
- Always cite the source article when referencing specific findings
- Focus on awareness, community, education, and empowerment
- Use person-first language
- Every draft MUST include the standard disclaimer from the style guide

You will receive today's EDS/dysautonomia intel report. Create exactly 3 scene-based content drafts.

Respond with a JSON array of 3 objects. Each object must have:
- "scene_idea": description of the animated scene (which characters, what they're doing, the setting)
- "image_prompt": a ready-to-use image generation prompt following the Image Prompt Template from the style guide
- "caption": the social media caption/post text
- "educational_note": the key educational takeaway from the intel
- "disclaimer": the standard disclaimer text

Return ONLY the JSON array, no other text.`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const date = todayDate();

  console.log(`${TAG} Starting at ${new Date().toISOString()}`);
  console.log(`${TAG} Dry run: ${dryRun}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${TAG} ERROR: ANTHROPIC_API_KEY not set`);
    process.exit(1);
  }

  // 1. Load style guide
  console.log(`${TAG} Loading zebby style guide...`);
  const styleGuide = loadStyleGuide();
  console.log(`${TAG} Style guide loaded (${styleGuide.length} chars)`);

  // 2. Read today's intel from MC
  console.log(`${TAG} Reading today's intel doc for "${LANE}"...`);
  const intelDoc = await getTodayIntelDoc(LANE);
  if (!intelDoc) {
    console.error(`${TAG} No intel doc found for ${LANE} on ${date}. Run daily-intel first.`);
    process.exit(1);
  }
  console.log(`${TAG} Found intel doc: "${intelDoc.title}" (${intelDoc.content.length} chars)`);

  // 3. Generate 3 scene drafts via Haiku
  console.log(`${TAG} Generating 3 Zebby scene drafts...`);
  const systemPrompt = buildSystemPrompt(styleGuide);
  const drafts = await callHaikuJSON<ZebbyDraft[]>(
    systemPrompt,
    `Here is today's EDS/dysautonomia intel report:\n\n${intelDoc.content}`,
    { maxTokens: 4096 },
  );
  console.log(`${TAG} Generated ${drafts.length} drafts`);

  // 4. Format as markdown for MC
  const markdown = drafts.map((d, i) => {
    return `## Scene ${i + 1}: ${d.scene_idea}

**Image Prompt:**
\`\`\`
${d.image_prompt}
\`\`\`

**Caption:**
${d.caption}

**Educational Note:**
${d.educational_note}

**Disclaimer:**
> ${d.disclaimer}`;
  }).join('\n\n---\n\n');

  if (dryRun) {
    console.log(`${TAG} DRY RUN — preview:\n`);
    console.log(markdown);
    console.log(`\n${TAG} Done (dry run).`);
    return;
  }

  // 5. Post to MC
  console.log(`${TAG} Posting drafts to Mission Control...`);
  const mcResult = await postToMC({
    title: `Zebby Scene Drafts — ${date}`,
    content: markdown,
    category: 'drafts',
    lane: LANE,
    tags: ['agent-drafts', 'eds', 'zebby'],
  });
  if (mcResult.ok) {
    console.log(`${TAG} MC doc posted: ${mcResult.id}`);
  } else {
    console.error(`${TAG} MC post failed: ${mcResult.error}`);
  }

  console.log(`${TAG} Done.`);
}

main().catch((err) => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});

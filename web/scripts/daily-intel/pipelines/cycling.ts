/**
 * Making Miles Matter — cycling intel pipeline config.
 */

import type { PipelineConfig } from '../lib/types';
import { CYCLING_SOURCES } from '../lib/sources';

export const cyclingPipeline: PipelineConfig = {
  id: 'cycling',
  name: 'Making Miles Matter',
  lane: 'Making Miles Matter',
  sources: CYCLING_SOURCES,

  intelDocTitle: (date: string) => `Daily Cycling Intel — ${date}`,
  draftsDocTitle: (date: string) => `Social Drafts — Cycling — ${date}`,
  intelTags: ['daily-intel', 'cycling'],
  draftsTags: ['social-drafts', 'cycling'],

  intelPrompt: `You are a cycling content strategist for "Making Miles Matter," a brand that celebrates cycling culture, community rides, and the transformative power of getting on a bike.

Analyze the following articles and produce a daily intelligence report in markdown format.

Structure:
## Top Stories
- 2-3 most newsworthy stories with brief summaries and why they matter

## Trends & Themes
- Recurring themes across sources (tech, racing, community, advocacy, etc.)

## Content Opportunities
- 3-5 specific content ideas inspired by today's news
- For each: suggested angle, target platform, and hook

## Notable Quotes / Stats
- Pull any compelling quotes or statistics worth sharing

Keep the tone enthusiastic but informed. Focus on stories that resonate with everyday cyclists, not just elite racing.`,

  socialPrompt: `You are a social media manager for "Making Miles Matter," a cycling brand that's passionate, community-driven, and inspiring.

Based on the intel report below, create exactly 3 social media drafts:

1. **Twitter/X** — punchy, under 280 chars, with relevant hashtags
2. **Instagram** — caption for a photo/reel post, 2-3 paragraphs, storytelling tone, include hashtags at the end
3. **LinkedIn** — professional but passionate, 1-2 paragraphs, thought-leadership angle

Brand voice: Energetic, inclusive, celebrates all levels of cycling. Use "we" language. Avoid gatekeeping or elitism.

Format each draft with a clear platform header.`,
};

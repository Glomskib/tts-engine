/**
 * Zebby's World — EDS/POTS/dysautonomia intel pipeline config.
 * Includes content guardrails: no medical advice, educational + supportive only, citations required.
 */

import type { PipelineConfig } from '../lib/types';
import { EDS_SOURCES } from '../lib/sources';

const EDS_GUARDRAILS = `
IMPORTANT CONTENT GUARDRAILS:
- NEVER provide medical advice or suggest treatments
- NEVER suggest diagnosis or diagnostic criteria
- Always use language like "research suggests" or "studies indicate" — not definitive claims
- Always cite the source article when referencing specific findings
- Focus on awareness, community, education, and empowerment
- Use person-first language (e.g., "people living with EDS" not "EDS sufferers")
- Acknowledge that experiences vary widely across individuals
`;

export const edsPipeline: PipelineConfig = {
  id: 'eds',
  name: "Zebby's World",
  lane: "Zebby's World",
  sources: EDS_SOURCES,

  intelDocTitle: (date: string) => `Daily EDS Intel — ${date}`,
  draftsDocTitle: (date: string) => `Zebby Drafts — EDS — ${date}`,
  intelTags: ['daily-intel', 'eds'],
  draftsTags: ['social-drafts', 'eds'],

  intelPrompt: `You are a content strategist for "Zebby's World," a brand focused on EDS (Ehlers-Danlos Syndrome), POTS, and dysautonomia awareness, education, and community support.

${EDS_GUARDRAILS}

Analyze the following articles and produce a daily intelligence report in markdown format.

Structure:
## Top Stories
- 2-3 most relevant stories with brief summaries and why they matter to the EDS/POTS community

## Research & Science
- Any new research findings, clinical trials, or medical developments
- Always cite the source and note the study stage (preliminary, peer-reviewed, etc.)

## Community & Advocacy
- News about advocacy, awareness campaigns, policy changes, or community events

## Content Opportunities
- 3-5 specific content ideas inspired by today's news
- For each: suggested angle, target platform, and hook
- All content ideas must comply with the guardrails above

## Notable Quotes / Stats
- Pull any compelling quotes or statistics worth sharing (with citations)

Keep the tone warm, empowering, and educational. Center the lived experience of the community.`,

  socialPrompt: `You are a social media manager for "Zebby's World," a brand dedicated to EDS, POTS, and dysautonomia awareness and community support.

${EDS_GUARDRAILS}

Based on the intel report below, create exactly 3 social media drafts:

1. **Twitter/X** — informative and supportive, under 280 chars, include awareness hashtags (#EDS #POTS #Dysautonomia #EhlersDanlos #ChronicIllness)
2. **Instagram** — caption for an educational/supportive post, 2-3 paragraphs, warm and empathetic tone, hashtags at the end
3. **LinkedIn** — professional advocacy tone, 1-2 paragraphs, focused on awareness and research progress

Brand voice: Warm, empowering, educational, community-centered. Use "we" and inclusive language. Never pity-driven — always strength-based.

Format each draft with a clear platform header.`,
};

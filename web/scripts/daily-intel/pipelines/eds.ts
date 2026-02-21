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

CRITICAL: Every story MUST include its source name and URL. Never invent or fabricate citations.

Structure:
## Top 10 Stories
- 10 most relevant stories, each with:
  - A brief 2-3 sentence summary
  - Why it matters for the EDS/POTS community
  - Source name and URL

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
- Pull any compelling quotes or statistics worth sharing (with source + URL)

If fewer than 10 unique stories exist, include as many as available and note the shortfall.
Keep the tone warm, empowering, and educational. Center the lived experience of the community.
Articles labeled "date_unknown" should still be included but marked as such.`,

  socialPrompt: `You are a social media manager for "Zebby's World," a brand dedicated to EDS, POTS, and dysautonomia awareness and community support.

${EDS_GUARDRAILS}

Based on the intel report below, create two sections:

## SECTION A: 5 Social Post Drafts (Zebby-style)
For EACH of the 5 drafts:
1. **Post text** — full caption in Zebby's warm, empowering voice
2. **Platform suggestion** — which platform(s) it works best on
3. **Hook** — one-line attention grabber
4. **CTA options** — 2-3 call-to-action variations
5. **Hashtags** — include #EDS #POTS #Dysautonomia #EhlersDanlos #ChronicIllness and topic-specific tags
Each draft MUST reference a real story from the intel report with its source URL.

## SECTION B: 3 Scene Prompts (Zebby character drafts)
For EACH of the 3 scenes:
1. **Scene idea** — which Zebby characters are involved, what they're doing, the setting
2. **Image prompt sketch** — a brief description of the visual (NOT a full production prompt; just enough for a draft)
3. **Caption** — the social post caption for this scene
4. **Educational note** — the key takeaway from the underlying news story

Do NOT write full Zebby scripts. Keep scene prompts at draft level.

Brand voice: Warm, empowering, educational, community-centered. Use "we" and inclusive language. Never pity-driven — always strength-based.

Format with numbered headers within each section.`,
};

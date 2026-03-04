/**
 * Creator Brief Generation — Claude API
 *
 * Generates a structured CreatorBriefData from product/brand/persona context,
 * validates purple cow tiers, and runs claim-risk scoring.
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';
import { classifyClaimRisk } from '@/lib/marketing/claim-risk';
import { buildWinnersContext } from '@/lib/winners/context';
import { fetchTopHookPatterns } from '@/lib/content-intelligence/hookExtractor';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { CreatorBriefData, PurpleCowTier } from './creator-brief-types';
import type { WinnersIntelligence } from '@/lib/winners/types';
import type { CowTier } from '@/lib/content-items/types';

// ── Types ────────────────────────────────────────────────────────

export interface BriefGenerationInput {
  workspaceId: string;
  title: string;
  brandName?: string;
  productName?: string;
  productCategory?: string;
  productNotes?: string;
  personaName?: string;
  selectedCowTier: CowTier;
  correlationId?: string;
}

export interface BriefGenerationResult {
  brief: CreatorBriefData;
  claimRiskScore: number;
  claimRiskLevel: 'LOW' | 'MED' | 'HIGH';
  aiDescription: string;
  hashtags: string[];
  caption: string;
}

// ── Validation ───────────────────────────────────────────────────

function validatePurpleCowTier(tier: PurpleCowTier, name: string): string[] {
  const issues: string[] = [];
  if (!tier.comment_bait || tier.comment_bait.length < 2) {
    issues.push(`${name} tier needs >= 2 comment_bait items`);
  }
  const modalities = [
    tier.visual_interrupts?.length > 0,
    tier.audio_interrupts?.length > 0,
    tier.behavioral_interrupts?.length > 0,
  ].filter(Boolean).length;
  if (modalities < 2) {
    issues.push(`${name} tier needs >= 1 interrupt in at least 2 modalities`);
  }
  return issues;
}

function validateBrief(brief: CreatorBriefData): string[] {
  const issues: string[] = [];
  if (!brief.purple_cow?.tiers) return ['Missing purple_cow.tiers'];

  for (const tierName of ['safe', 'edgy', 'unhinged'] as const) {
    const tier = brief.purple_cow.tiers[tierName];
    if (!tier) {
      issues.push(`Missing ${tierName} tier`);
      continue;
    }
    issues.push(...validatePurpleCowTier(tier, tierName));
  }
  return issues;
}

// ── Prompt Building ──────────────────────────────────────────────

function buildHookPatternsContext(hooks: Array<{ pattern: string; example_hook: string | null; performance_score: number }>): string {
  if (hooks.length === 0) return '';
  const lines = hooks.map(h =>
    `  - "${h.pattern}" (score: ${h.performance_score}/10)${h.example_hook ? ` — e.g. "${h.example_hook}"` : ''}`,
  );
  return `\nWINNING HOOK PATTERNS (from past high-performing content — use or adapt these):\n${lines.join('\n')}\n`;
}

function buildSystemPrompt(winnersContext: string, hookPatternsContext: string): string {
  return `You are a senior UGC content strategist for supplement and wellness brands.
You create structured creator briefs that maximize scroll-stopping power via the "Purple Cow" methodology.

Output a single JSON object matching the CreatorBriefData schema EXACTLY. No additional text.

Key requirements:
- one_liner: Single punchy sentence summarizing the video concept
- goal: What the video should accomplish (awareness, conversion, etc.)
- audience_persona: Brief description of the target viewer
- success_metric: Primary KPI (e.g. "3s hook rate > 40%")
- beforehand_checklist: 3-5 items the creator needs before filming
- setting, plot, emotional_arc, performance_tone: Scene direction
- script_text: Full spoken script (30-60 seconds)
- scenes: Array of scene breakdowns with framing, action, spoken lines, on-screen text, b-roll suggestions
- recording_notes: 3-5 filming tips
- captions_pack: 3-5 caption variations, 8-12 hashtags, 2-3 CTAs, 3-5 comment prompts
- purple_cow.tiers: Each tier (safe, edgy, unhinged) MUST have:
  - >= 2 comment_bait items
  - >= 1 interrupt in at least 2 of: visual_interrupts, audio_interrupts, behavioral_interrupts
- purple_cow.notes_for_creator: Tips on how to execute the purple cow elements

${winnersContext}
${hookPatternsContext}
IMPORTANT: Do not make health claims that could be flagged by regulators. Use hedging language ("may help", "designed to support") instead of absolute claims ("cures", "proven to"). Keep captions compliant.`;
}

function buildUserPrompt(input: BriefGenerationInput): string {
  const parts: string[] = [`Generate a creator brief for: "${input.title}"`];
  if (input.brandName) parts.push(`Brand: ${input.brandName}`);
  if (input.productName) parts.push(`Product: ${input.productName}`);
  if (input.productCategory) parts.push(`Category: ${input.productCategory}`);
  if (input.productNotes) parts.push(`Product notes: ${input.productNotes}`);
  if (input.personaName) parts.push(`Persona/creator archetype: ${input.personaName}`);
  parts.push(`Selected cow tier emphasis: ${input.selectedCowTier}`);
  parts.push(`\nReturn ONLY valid JSON matching the CreatorBriefData schema.`);
  return parts.join('\n');
}

function buildRetryPrompt(input: BriefGenerationInput, issues: string[]): string {
  return `${buildUserPrompt(input)}

CRITICAL: Your previous attempt had validation issues:
${issues.map(i => `- ${i}`).join('\n')}

Fix ALL issues. Each purple_cow tier MUST have:
- At least 2 comment_bait items (strings that provoke comments)
- At least 1 interrupt in 2+ modalities (visual_interrupts, audio_interrupts, behavioral_interrupts)

Return ONLY valid JSON.`;
}

// ── Winners Fetch ────────────────────────────────────────────────

async function fetchWinnersIntelligence(
  workspaceId: string,
  productCategory?: string,
): Promise<WinnersIntelligence | null> {
  let query = supabaseAdmin
    .from('winners_bank')
    .select('*')
    .eq('user_id', workspaceId)
    .order('performance_score', { ascending: false })
    .limit(10);

  if (productCategory) {
    query = query.eq('product_category', productCategory);
  }

  const { data, error } = await query;
  if (error || !data?.length) return null;

  return {
    winners: data,
    patterns: null,
    totalCount: data.length,
  };
}

// ── Main Generator ───────────────────────────────────────────────

export async function generateCreatorBrief(
  input: BriefGenerationInput,
): Promise<BriefGenerationResult> {
  // 1. Gather context
  const [winnersIntel, topHooks] = await Promise.all([
    fetchWinnersIntelligence(input.workspaceId, input.productCategory),
    fetchTopHookPatterns(input.workspaceId, 5),
  ]);
  const winnersContext = buildWinnersContext(winnersIntel);
  const hookPatternsContext = buildHookPatternsContext(topHooks);
  const systemPrompt = buildSystemPrompt(winnersContext, hookPatternsContext);

  // 2. First generation attempt
  let { parsed: brief } = await callAnthropicJSON<CreatorBriefData>(
    buildUserPrompt(input),
    {
      systemPrompt,
      maxTokens: 8192,
      temperature: 0.8,
      correlationId: input.correlationId,
      requestType: 'creator_brief',
      agentId: 'brief-gen',
    },
  );

  // 3. Validate purple cow tiers — retry once if needed
  const issues = validateBrief(brief);
  if (issues.length > 0) {
    const retry = await callAnthropicJSON<CreatorBriefData>(
      buildRetryPrompt(input, issues),
      {
        systemPrompt,
        maxTokens: 8192,
        temperature: 0.7,
        correlationId: input.correlationId,
        requestType: 'creator_brief_retry',
        agentId: 'brief-gen',
      },
    );
    brief = retry.parsed;
  }

  // 4. Claim risk scoring
  const selectedTier = brief.purple_cow?.tiers?.[input.selectedCowTier];
  const textToScore = [
    brief.script_text,
    ...(brief.captions_pack?.captions || []),
    ...(selectedTier?.comment_bait || []),
    ...(selectedTier?.visual_interrupts || []),
    ...(selectedTier?.audio_interrupts || []),
    ...(selectedTier?.behavioral_interrupts || []),
  ].join('\n');

  let riskResult = classifyClaimRisk(textToScore);

  // 5. If HIGH risk, regenerate once with tighter claims
  if (riskResult.level === 'HIGH') {
    const tightenedPrompt = `${buildUserPrompt(input)}

IMPORTANT: Previous generation was flagged HIGH risk for claim compliance.
Risk flags: ${riskResult.flags.join(', ')}

Tighten ALL health claims. Use hedging language ("may support", "designed to help").
Remove any absolute claims. Preserve the creative weirdness and purple cow elements.
Return ONLY valid JSON.`;

    const { parsed: tightenedBrief } = await callAnthropicJSON<CreatorBriefData>(
      tightenedPrompt,
      {
        systemPrompt,
        maxTokens: 8192,
        temperature: 0.7,
        correlationId: input.correlationId,
        requestType: 'creator_brief_tighten',
        agentId: 'brief-gen',
      },
    );
    brief = tightenedBrief;

    const retightenedTier = brief.purple_cow?.tiers?.[input.selectedCowTier];
    const retightenedText = [
      brief.script_text,
      ...(brief.captions_pack?.captions || []),
      ...(retightenedTier?.comment_bait || []),
    ].join('\n');
    riskResult = classifyClaimRisk(retightenedText);
  }

  // 6. Derive posting metadata
  const hashtags = (brief.captions_pack?.hashtags || []).slice(0, 5);
  const caption = brief.captions_pack?.captions?.[0] || '';
  const aiDescription = brief.one_liner || brief.goal || input.title;

  return {
    brief,
    claimRiskScore: riskResult.score,
    claimRiskLevel: riskResult.level,
    aiDescription,
    hashtags,
    caption,
  };
}

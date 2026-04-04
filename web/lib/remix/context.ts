/**
 * Remix Context Builder
 *
 * Builds a RemixContext from existing transcriber output + vibe analysis.
 * No new AI calls — just data transformation.
 */

import type { RemixContext } from './types';

interface TranscribeAnalysis {
  hook: { line: string; style: string; strength: number };
  content: { format: string; pacing: string; structure: string };
  keyPhrases: string[];
  emotionalTriggers: string[];
  whatWorks: string[];
  targetEmotion: string;
}

interface VibeData {
  delivery_style?: string;
  pacing_style?: string;
  hook_energy?: string;
  visual_style?: string;
  visual_rhythm?: string;
  cta_tone?: string;
  reveal_timing?: string;
  recreate_guidance?: string[];
  timing_arc?: {
    hook_ends_at: number;
    explanation_ends_at: number;
    proof_reveal_at: number;
    cta_starts_at: number;
  };
}

export function buildRemixContext(params: {
  url: string;
  platform: 'tiktok' | 'youtube';
  transcript: string;
  duration: number;
  analysis: TranscribeAnalysis;
  vibe?: VibeData | null;
}): RemixContext {
  const { url, platform, transcript, duration, analysis, vibe } = params;

  const ctx: RemixContext = {
    source_url: url,
    platform,
    transcript,
    duration,
    original_hook: {
      line: analysis.hook.line,
      style: analysis.hook.style,
      strength: analysis.hook.strength,
    },
    content: {
      format: analysis.content.format,
      pacing: analysis.content.pacing,
      structure: analysis.content.structure,
    },
    key_phrases: analysis.keyPhrases || [],
    emotional_triggers: analysis.emotionalTriggers || [],
    what_works: analysis.whatWorks || [],
    target_emotion: analysis.targetEmotion || '',
  };

  if (vibe && vibe.delivery_style) {
    ctx.vibe = {
      delivery_style: vibe.delivery_style,
      pacing_style: vibe.pacing_style || '',
      hook_energy: vibe.hook_energy || '',
      visual_style: vibe.visual_style || '',
      visual_rhythm: vibe.visual_rhythm || '',
      cta_tone: vibe.cta_tone || '',
      reveal_timing: vibe.reveal_timing || '',
      recreate_guidance: vibe.recreate_guidance || [],
      timing_arc: vibe.timing_arc,
    };
  }

  return ctx;
}

/**
 * Build a prompt section from RemixContext for script generation.
 */
export function buildRemixPromptContext(ctx: RemixContext): string {
  const sections: string[] = [];

  sections.push('=== ORIGINAL VIDEO ANALYSIS ===');
  sections.push(`Format: ${ctx.content.format}`);
  sections.push(`Structure: ${ctx.content.structure}`);
  sections.push(`Pacing: ${ctx.content.pacing}`);
  sections.push(`Hook style: ${ctx.original_hook.style} (strength: ${ctx.original_hook.strength}/10)`);
  sections.push(`Original hook: "${ctx.original_hook.line}"`);

  if (ctx.what_works.length > 0) {
    sections.push(`\nWhy this video works:`);
    for (const w of ctx.what_works) {
      sections.push(`  - ${w}`);
    }
  }

  if (ctx.emotional_triggers.length > 0) {
    sections.push(`Emotional triggers: ${ctx.emotional_triggers.join(', ')}`);
  }

  if (ctx.key_phrases.length > 0) {
    sections.push(`Key phrases from original: ${ctx.key_phrases.slice(0, 5).join(', ')}`);
  }

  if (ctx.vibe) {
    sections.push(`\nStyle profile:`);
    sections.push(`  Delivery: ${ctx.vibe.delivery_style}`);
    sections.push(`  Pacing: ${ctx.vibe.pacing_style}`);
    sections.push(`  Hook energy: ${ctx.vibe.hook_energy}`);
    sections.push(`  Visual style: ${ctx.vibe.visual_style}`);
    if (ctx.vibe.recreate_guidance.length > 0) {
      sections.push(`\nRecreation guidance:`);
      for (const g of ctx.vibe.recreate_guidance) {
        sections.push(`  - ${g}`);
      }
    }
  }

  sections.push('=== END ORIGINAL VIDEO ===');

  return sections.join('\n');
}

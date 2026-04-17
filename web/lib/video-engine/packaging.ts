/**
 * Content packaging — generate ready-to-paste social copy for a rendered clip.
 *
 * One Claude call per clip → { caption_text, hashtags, suggested_title, cta_suggestion }.
 * Mode-aware: affiliate prompts skew toward sales-y hooks + product-fitness; nonprofit
 * prompts skew toward mission/impact framing.
 *
 * Designed to fail soft — if Claude is unavailable, we fall back to deterministic
 * defaults so the user still gets something usable on the clip card.
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';
import type { Mode } from './types';

export interface ClipPackagingInput {
  mode: Mode;
  clipText: string;
  hookText: string | null;
  clipType: string;          // hook, product, benefit, cta, testimonial, mission, ...
  durationSec: number;
  templateKey: string;
  ctaSuggestionFromTemplate: string | null;
  context: Record<string, unknown>;   // run.context_json
}

export interface ClipPackaging {
  caption_text: string;
  hashtags: string[];
  suggested_title: string;
  cta_suggestion: string;
  /** True if Claude returned the value; false when we fell back to defaults. */
  ai_generated: boolean;
}

const SYSTEM_PROMPT_AFFILIATE =
  `You write punchy, conversion-focused short-form social copy for affiliate creators ` +
  `posting on TikTok, Reels, and Shorts. You write like a real human on the platform — ` +
  `no corporate jargon, no fake hype, no "get ready with me" filler. ` +
  `Your captions sell without sounding salesy. Your hashtags are platform-native ` +
  `(short, lowercase, on-trend). Your titles work as YouTube Shorts titles too.`;

const SYSTEM_PROMPT_NONPROFIT =
  `You write moving, mission-focused social copy for nonprofits and cause-driven creators. ` +
  `You write like a real organizer or volunteer — warm, specific, never generic. ` +
  `Your captions invite people in without guilt-tripping. Your hashtags are cause-relevant. ` +
  `Your titles emphasize impact, community, and "why this matters."`;

function buildPrompt(input: ClipPackagingInput): string {
  const ctxLines = Object.entries(input.context)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `- ${k}: ${String(v)}`)
    .join('\n');

  return [
    `Clip type: ${input.clipType}`,
    `Mode: ${input.mode}`,
    `Duration: ${Math.round(input.durationSec)}s`,
    `Template: ${input.templateKey}`,
    input.hookText ? `Hook line spoken on screen: "${input.hookText}"` : '',
    `Full transcript of this clip:`,
    `"""`,
    input.clipText,
    `"""`,
    ctxLines ? `Context provided by the creator:\n${ctxLines}` : '',
    ``,
    `Write social copy for this clip. Return JSON only with this exact shape:`,
    `{`,
    `  "caption_text": "1-3 sentence caption optimized for ${input.mode === 'affiliate' ? 'TikTok/Reels conversion' : 'community engagement and shares'}. Lead with the hook, end with a soft CTA. Max 220 chars.",`,
    `  "hashtags": ["8-12 lowercase hashtags without #, ordered most-relevant first, mixing 2-3 broad + 5-7 niche"],`,
    `  "suggested_title": "A 6-10 word title for YouTube Shorts / Reels — sentence case, no clickbait punctuation",`,
    `  "cta_suggestion": "One short imperative line for the on-screen CTA card. ${input.mode === 'affiliate' ? 'E.g. \\"Tap the link\\", \\"Comment WANT\\".' : 'E.g. \\"Register today\\", \\"Donate now\\".'} Max 4 words."`,
    `}`,
    input.ctaSuggestionFromTemplate
      ? `(The template's default CTA is "${input.ctaSuggestionFromTemplate}" — feel free to keep or improve.)`
      : '',
  ].filter(Boolean).join('\n');
}

function fallbackPackaging(input: ClipPackagingInput): ClipPackaging {
  const hookOrFirst = (input.hookText ?? input.clipText).split(/(?<=[.!?])\s+/)[0] ?? input.clipText;
  const cleanHook = hookOrFirst.length > 180 ? hookOrFirst.slice(0, 177) + '…' : hookOrFirst;

  const baseTags = input.mode === 'affiliate'
    ? ['affiliate', 'tiktokshop', 'amazonfinds', 'mustbuy', 'fyp', 'review', 'product']
    : ['nonprofit', 'community', 'event', 'fundraiser', 'volunteer', 'mission', 'impact'];

  return {
    caption_text: cleanHook,
    hashtags: baseTags,
    suggested_title: cleanHook.slice(0, 60),
    cta_suggestion: input.ctaSuggestionFromTemplate
      ?? (input.mode === 'affiliate' ? 'Tap to shop' : 'Join us'),
    ai_generated: false,
  };
}

function sanitizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t).trim().replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 12);
}

function clampStr(s: unknown, max: number, fallback = ''): string {
  const v = typeof s === 'string' ? s.trim() : '';
  if (!v) return fallback;
  return v.length > max ? v.slice(0, max - 1).trimEnd() + '…' : v;
}

export async function packageClip(
  input: ClipPackagingInput,
  opts: { correlationId?: string } = {},
): Promise<ClipPackaging> {
  const systemPrompt = input.mode === 'affiliate' ? SYSTEM_PROMPT_AFFILIATE : SYSTEM_PROMPT_NONPROFIT;

  try {
    const { parsed } = await callAnthropicJSON<{
      caption_text?: string;
      hashtags?: unknown;
      suggested_title?: string;
      cta_suggestion?: string;
    }>(buildPrompt(input), {
      systemPrompt,
      maxTokens: 600,
      temperature: 0.7,
      correlationId: opts.correlationId,
      requestType: 'analysis',
      agentId: 've-clip-packager',
    });

    const fallback = fallbackPackaging(input);

    return {
      caption_text:    clampStr(parsed.caption_text,    240, fallback.caption_text),
      hashtags:        sanitizeHashtags(parsed.hashtags).length ? sanitizeHashtags(parsed.hashtags) : fallback.hashtags,
      suggested_title: clampStr(parsed.suggested_title, 90,  fallback.suggested_title),
      cta_suggestion:  clampStr(parsed.cta_suggestion,  40,  fallback.cta_suggestion),
      ai_generated: true,
    };
  } catch (err) {
    console.warn('[ve-packaging] Claude call failed, using fallback:', err instanceof Error ? err.message : String(err));
    return fallbackPackaging(input);
  }
}

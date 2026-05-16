// ============================================================
// FlashFlow — Pattern feature extractor.
// Drop into: web/lib/pattern-extractor.ts
//
// After the AI generates a script, extract abstract features
// (hook_type, persona, tone, etc) and persist them into
// script_patterns. Two strategies:
//   1. Ask the same AI call to ALSO return tags (cheapest, most reliable)
//   2. Lightweight regex/keyword fallback if (1) wasn't requested
//
// Strategy (1) is preferred — extend your generation prompt to
// emit a JSON tag block alongside each script.
// ============================================================

export type ScriptPattern = {
  hook_type?: string;
  hook_length?: number;
  script_length?: number;
  niche?: string;
  persona?: string;
  cta_style?: string;
  tone?: string;
  product_category?: string;
  pace?: string;
};

// Canonical vocabularies. Keep these small so the pattern pool
// doesn't fragment. If the AI emits anything outside the set, we
// normalize it to the nearest known value.
export const VOCAB = {
  hook_type: ['question', 'shock', 'storytime', 'pov', 'before_after', 'controversy', 'list', 'demo'],
  persona: ['expert', 'peer', 'skeptic', 'newbie', 'insider', 'parent', 'pro_user'],
  cta_style: ['urgency', 'curiosity', 'social_proof', 'discount', 'limited_stock', 'none'],
  tone: ['casual', 'authoritative', 'energetic', 'calm', 'snarky', 'warm'],
  pace: ['fast_cut', 'slow_build', 'mixed'],
} as const;

function normalize<K extends keyof typeof VOCAB>(
  value: string | undefined,
  vocab: K
): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const list = VOCAB[vocab] as readonly string[];
  return list.includes(v) ? v : undefined;
}

export function normalizePattern(raw: Partial<ScriptPattern>): ScriptPattern {
  return {
    hook_type: normalize(raw.hook_type, 'hook_type'),
    hook_length: raw.hook_length,
    script_length: raw.script_length,
    niche: raw.niche?.toLowerCase().trim(),
    persona: normalize(raw.persona, 'persona'),
    cta_style: normalize(raw.cta_style, 'cta_style'),
    tone: normalize(raw.tone, 'tone'),
    product_category: raw.product_category?.toLowerCase().trim(),
    pace: normalize(raw.pace, 'pace'),
  };
}

// Naive keyword fallback for when the AI didn't emit tags.
// Better than nothing — but the upgrade path is to update the
// generation prompt so the AI returns tags directly.
export function extractPatternHeuristic(args: {
  hook: string;
  fullScript: string;
  niche?: string;
}): ScriptPattern {
  const { hook, fullScript, niche } = args;
  const lcHook = hook.toLowerCase();
  const lcAll = fullScript.toLowerCase();

  let hook_type: ScriptPattern['hook_type'];
  if (/\?$/.test(hook.trim()) || /^(have you|did you|do you|what if|why do)/.test(lcHook)) {
    hook_type = 'question';
  } else if (/(stop|wait|never|listen|don'?t)/.test(lcHook.split(' ').slice(0, 3).join(' '))) {
    hook_type = 'shock';
  } else if (/^(i was|i used to|last week|yesterday|once|so |okay so)/.test(lcHook)) {
    hook_type = 'storytime';
  } else if (/^(pov:|pov,)/.test(lcHook)) {
    hook_type = 'pov';
  } else if (/(before|after|then|now)/.test(lcHook)) {
    hook_type = 'before_after';
  } else if (/^(3 |5 |top |the .+ that)/.test(lcHook)) {
    hook_type = 'list';
  }

  let cta_style: ScriptPattern['cta_style'] = 'none';
  if (/(today only|limited|hurry|don'?t miss|last chance)/.test(lcAll)) cta_style = 'urgency';
  else if (/(secret|trick|hack|won'?t believe)/.test(lcAll)) cta_style = 'curiosity';
  else if (/(everyone|thousands|reviewers|trending|viral)/.test(lcAll)) cta_style = 'social_proof';
  else if (/(\d+% off|discount|coupon|code)/.test(lcAll)) cta_style = 'discount';
  else if (/(out of stock|selling out|almost gone)/.test(lcAll)) cta_style = 'limited_stock';

  return normalizePattern({
    hook_type,
    hook_length: hook.split(/\s+/).filter(Boolean).length,
    script_length: fullScript.split(/\s+/).filter(Boolean).length,
    niche,
    cta_style,
  });
}

/**
 * Mode registry. Adding a new mode = one file (this one) + register templates
 * + register CTAs. The pipeline never branches on mode itself; it asks the
 * registry for "the weights / templates / CTAs for mode X".
 */

import type { ChunkFeatures, Mode, ModeConfig } from './types';

const FEATURE_KEYS: Array<keyof ChunkFeatures> = [
  'hookStrength',
  'productMention',
  'emotionalIntensity',
  'benefitStatement',
  'ctaLikelihood',
  'retentionPotential',
  'testimonialPhrase',
  'groupLanguage',
  'scenicLanguage',
  'celebrationLanguage',
  'durationFit',
  'specificity',
];

function zeroWeights(): Record<keyof ChunkFeatures, number> {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as Record<keyof ChunkFeatures, number>;
}

const AFFILIATE: ModeConfig = {
  key: 'affiliate',
  label: 'Affiliate',
  description:
    'Direct-response short-form for product hooks, demos, and conversions. Optimizes for product moments, hooks, benefits, and CTAs.',
  scoreWeights: {
    ...zeroWeights(),
    hookStrength: 1.6,
    productMention: 1.4,
    benefitStatement: 1.2,
    ctaLikelihood: 1.0,
    retentionPotential: 0.9,
    emotionalIntensity: 0.6,
    specificity: 0.7,
    durationFit: 0.8,
  },
  defaultTemplateKeys: ['aff_tiktok_shop', 'aff_ugc_review', 'aff_talking_head'],
  defaultCTAKey: 'shop_now',
};

const NONPROFIT: ModeConfig = {
  key: 'nonprofit',
  label: 'Nonprofit',
  description:
    'Mission-driven recap, recruitment, and donor storytelling. Optimizes for emotion, group moments, testimonials, and celebration — not product mentions.',
  scoreWeights: {
    ...zeroWeights(),
    emotionalIntensity: 1.5,
    testimonialPhrase: 1.4,
    groupLanguage: 1.2,
    celebrationLanguage: 1.1,
    scenicLanguage: 0.8,
    hookStrength: 1.0,
    benefitStatement: 0.5,
    retentionPotential: 0.6,
    durationFit: 0.8,
    // productMention intentionally 0 — nonprofit mode actively ignores product talk.
  },
  defaultTemplateKeys: [
    'np_event_recap',
    'np_join_us',
    'np_why_this_matters',
    'np_sponsor_highlight',
    'np_testimonial',
  ],
  defaultCTAKey: 'register_now',
};

const CLIPPER: ModeConfig = {
  key: 'clipper',
  label: 'Long-Form Clipper',
  description:
    'Volume-first clipping for long-form creators and repurposers. Optimizes for hook strength, retention potential, and specific moments — not product mentions or donation asks.',
  scoreWeights: {
    ...zeroWeights(),
    hookStrength: 1.5,
    retentionPotential: 1.4,
    emotionalIntensity: 1.1,
    specificity: 1.0,
    durationFit: 1.0,
    testimonialPhrase: 0.8,
    benefitStatement: 0.6,
    celebrationLanguage: 0.5,
    // productMention and ctaLikelihood stay at 0 — clipper mode ignores sales signals.
  },
  defaultTemplateKeys: [
    'clip_viral_moment',
    'clip_fast_highlight',
    'clip_educational_cut',
    'clip_clean_talking_head',
  ],
  defaultCTAKey: 'watch_full',
};

const REGISTRY: Record<Mode, ModeConfig> = {
  affiliate: AFFILIATE,
  nonprofit: NONPROFIT,
  clipper: CLIPPER,
};

export function getMode(mode: Mode): ModeConfig {
  const cfg = REGISTRY[mode];
  if (!cfg) throw new Error(`Unknown mode: ${mode}`);
  return cfg;
}

export function listModes(): ModeConfig[] {
  return Object.values(REGISTRY);
}

export function isMode(value: unknown): value is Mode {
  return value === 'affiliate' || value === 'nonprofit' || value === 'clipper';
}

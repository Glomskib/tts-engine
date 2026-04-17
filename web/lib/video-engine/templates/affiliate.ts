/**
 * Affiliate template pack — direct-response, conversion-shaped.
 */

import type { RenderTemplate, TemplateBuildInput } from '../types';
import {
  captionClips,
  composeTimeline,
  ctaCardClip,
  headlineClip,
  videoClip,
} from './shared';
import { getCTAOrDefault } from '../ctas';

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

function buildAffiliateClip(
  input: TemplateBuildInput,
  opts: {
    captionTone: 'bold' | 'casual' | 'informational';
    headlineBg: string;
    headlineColor: string;
    punchIn: boolean;
    showHeadline: boolean;
  },
) {
  const length = input.candidate.end - input.candidate.start;
  const ctaDuration = 1.6;
  const ctaStart = Math.max(0, length - ctaDuration);

  const cta = getCTAOrDefault(input.ctaKey, 'affiliate');

  const captionStyle =
    opts.captionTone === 'bold'
      ? { fontFamily: FONT, fontSize: 80, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'upper' as const, weight: 900, yPosition: 0.78 }
      : opts.captionTone === 'casual'
        ? { fontFamily: FONT, fontSize: 70, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'normal' as const, weight: 700, yPosition: 0.78 }
        : { fontFamily: FONT, fontSize: 64, color: '#FFFFFF', background: 'rgba(0,0,0,0.55)', textCase: 'normal' as const, weight: 600, yPosition: 0.85 };

  return composeTimeline({
    video: videoClip(input, { punchIn: opts.punchIn }),
    captions: captionClips(input.candidate.text, ctaStart, captionStyle),
    headline:
      opts.showHeadline && input.candidate.hookText
        ? headlineClip(input.candidate.hookText, {
            fontFamily: FONT,
            fontSize: 64,
            color: opts.headlineColor,
            background: opts.headlineBg,
            textCase: 'upper',
          })
        : null,
    ctaCard: ctaCardClip(cta, ctaStart, ctaDuration, {
      background: '#000000',
      color: '#FFFFFF',
      fontFamily: FONT,
    }),
  });
}

const AFF_TIKTOK_SHOP: RenderTemplate = {
  key: 'aff_tiktok_shop',
  mode: 'affiliate',
  name: 'TikTok Shop Seller',
  description: 'High-energy product hook with bold caption pacing and a punchy shop CTA.',
  pacing: 'fast',
  captionTone: 'bold',
  defaultCTAKey: 'shop_now',
  build: (input) =>
    buildAffiliateClip(input, {
      captionTone: 'bold',
      headlineBg: '#FF005C',
      headlineColor: '#FFFFFF',
      punchIn: true,
      showHeadline: true,
    }),
};

const AFF_UGC_REVIEW: RenderTemplate = {
  key: 'aff_ugc_review',
  mode: 'affiliate',
  name: 'UGC Product Review',
  description: 'Authentic creator-feel: mid pacing, casual captions, soft headline, "Try It Today" CTA.',
  pacing: 'medium',
  captionTone: 'casual',
  defaultCTAKey: 'try_today',
  build: (input) =>
    buildAffiliateClip(input, {
      captionTone: 'casual',
      headlineBg: '#FFFFFF',
      headlineColor: '#111111',
      punchIn: false,
      showHeadline: true,
    }),
};

const AFF_TALKING_HEAD: RenderTemplate = {
  key: 'aff_talking_head',
  mode: 'affiliate',
  name: 'Talking Head Viral Clip',
  description: 'Lower-third style captions, no top headline, slow burn for storytelling clips.',
  pacing: 'slow',
  captionTone: 'informational',
  defaultCTAKey: 'learn_more',
  build: (input) =>
    buildAffiliateClip(input, {
      captionTone: 'informational',
      headlineBg: '#000000',
      headlineColor: '#FFFFFF',
      punchIn: false,
      showHeadline: false,
    }),
};

export const AFFILIATE_TEMPLATES: RenderTemplate[] = [AFF_TIKTOK_SHOP, AFF_UGC_REVIEW, AFF_TALKING_HEAD];

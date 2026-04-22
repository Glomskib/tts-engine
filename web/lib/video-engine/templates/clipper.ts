/**
 * Clipper template pack — volume-first clips from long-form footage.
 * Shapes: viral hook, fast highlight, educational cut, clean talking head.
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

function buildClipperClip(
  input: TemplateBuildInput,
  opts: {
    captionTone: 'bold' | 'casual' | 'informational';
    headlineBg: string;
    headlineColor: string;
    punchIn: boolean;
    showHeadline: boolean;
    showCta: boolean;
  },
) {
  const length = input.candidate.end - input.candidate.start;
  const ctaDuration = 1.4;
  const ctaStart = Math.max(0, length - ctaDuration);

  const cta = getCTAOrDefault(input.ctaKey, 'clipper');

  const captionStyle =
    opts.captionTone === 'bold'
      ? { fontFamily: FONT, fontSize: 84, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'upper' as const, weight: 900, yPosition: 0.78 }
      : opts.captionTone === 'casual'
        ? { fontFamily: FONT, fontSize: 72, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'normal' as const, weight: 700, yPosition: 0.78 }
        : { fontFamily: FONT, fontSize: 62, color: '#FFFFFF', background: 'rgba(0,0,0,0.55)', textCase: 'normal' as const, weight: 600, yPosition: 0.88 };

  return composeTimeline({
    video: videoClip(input, { punchIn: opts.punchIn }),
    captions: captionClips(input.candidate.text, opts.showCta ? ctaStart : length, captionStyle),
    headline:
      opts.showHeadline && input.candidate.hookText
        ? headlineClip(input.candidate.hookText, {
            fontFamily: FONT,
            fontSize: 62,
            color: opts.headlineColor,
            background: opts.headlineBg,
            textCase: 'upper',
          })
        : null,
    ctaCard: opts.showCta
      ? ctaCardClip(cta, ctaStart, ctaDuration, {
          background: '#000000',
          color: '#FFFFFF',
          fontFamily: FONT,
        })
      : null,
  });
}

const CLIP_VIRAL_MOMENT: RenderTemplate = {
  key: 'clip_viral_moment',
  mode: 'clipper',
  name: 'Viral Moment',
  description: 'Scroll-stopping hook up top, bold all-caps captions, punch-in for energy.',
  pacing: 'fast',
  captionTone: 'bold',
  defaultCTAKey: 'follow_for_more',
  build: (input) =>
    buildClipperClip(input, {
      captionTone: 'bold',
      headlineBg: '#FF3C00',
      headlineColor: '#FFFFFF',
      punchIn: true,
      showHeadline: true,
      showCta: true,
    }),
};

const CLIP_FAST_HIGHLIGHT: RenderTemplate = {
  key: 'clip_fast_highlight',
  mode: 'clipper',
  name: 'Fast Highlight',
  description: 'Punchy 9:16 cut with bold captions and a short Part-2 tease. Built for volume.',
  pacing: 'fast',
  captionTone: 'bold',
  defaultCTAKey: 'part_two',
  build: (input) =>
    buildClipperClip(input, {
      captionTone: 'bold',
      headlineBg: '#000000',
      headlineColor: '#FFFFFF',
      punchIn: true,
      showHeadline: false,
      showCta: true,
    }),
};

const CLIP_EDUCATIONAL_CUT: RenderTemplate = {
  key: 'clip_educational_cut',
  mode: 'clipper',
  name: 'Educational Cut',
  description: 'Informational captions, soft headline, steady pacing. For explainer and tutorial clips.',
  pacing: 'medium',
  captionTone: 'informational',
  defaultCTAKey: 'watch_full',
  build: (input) =>
    buildClipperClip(input, {
      captionTone: 'informational',
      headlineBg: '#00D4AA',
      headlineColor: '#0A0A0A',
      punchIn: false,
      showHeadline: true,
      showCta: true,
    }),
};

const CLIP_CLEAN_TALKING_HEAD: RenderTemplate = {
  key: 'clip_clean_talking_head',
  mode: 'clipper',
  name: 'Clean Talking Head',
  description: 'Lower-third captions only. No overlay, no CTA card — keeps the speaker front and center.',
  pacing: 'slow',
  captionTone: 'casual',
  defaultCTAKey: 'subscribe',
  build: (input) =>
    buildClipperClip(input, {
      captionTone: 'casual',
      headlineBg: '#000000',
      headlineColor: '#FFFFFF',
      punchIn: false,
      showHeadline: false,
      showCta: false,
    }),
};

export const CLIPPER_TEMPLATES: RenderTemplate[] = [
  CLIP_VIRAL_MOMENT,
  CLIP_FAST_HIGHLIGHT,
  CLIP_EDUCATIONAL_CUT,
  CLIP_CLEAN_TALKING_HEAD,
];

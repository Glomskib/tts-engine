/**
 * Nonprofit template pack — emotional, mission-driven, ad-ready event content.
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

interface NPOpts {
  captionTone: 'emotional' | 'informational';
  headlineText?: string;
  headlineBg: string;
  headlineColor: string;
  showHeadline: boolean;
  punchIn: boolean;
  ctaKey: string;
  pacing: 'fast' | 'medium' | 'slow';
}

function buildNonprofitClip(input: TemplateBuildInput, opts: NPOpts) {
  const length = input.candidate.end - input.candidate.start;
  const ctaDuration = 1.8;
  const ctaStart = Math.max(0, length - ctaDuration);

  // Allow per-render override but fall back to template default.
  const cta = getCTAOrDefault(input.ctaKey || opts.ctaKey, 'nonprofit');

  const captionStyle =
    opts.captionTone === 'emotional'
      ? { fontFamily: FONT, fontSize: 70, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'normal' as const, weight: 700, yPosition: 0.82 }
      : { fontFamily: FONT, fontSize: 60, color: '#FFFFFF', background: 'rgba(0,0,0,0.6)', textCase: 'normal' as const, weight: 600, yPosition: 0.86 };

  // Headline can be overridden by run.context_json (event_name, mission_text, sponsor_name)
  const ctx = input.context as Record<string, string | undefined>;
  const headlineText =
    opts.headlineText ||
    ctx.event_name ||
    ctx.mission_text ||
    input.candidate.hookText ||
    '';

  return composeTimeline({
    video: videoClip(input, { punchIn: opts.punchIn }),
    captions: captionClips(input.candidate.text, ctaStart, captionStyle),
    headline:
      opts.showHeadline && headlineText
        ? headlineClip(headlineText, {
            fontFamily: FONT,
            fontSize: 56,
            color: opts.headlineColor,
            background: opts.headlineBg,
            textCase: 'upper',
          })
        : null,
    ctaCard: ctaCardClip(cta, ctaStart, ctaDuration, {
      background: '#0A0A0A',
      color: '#FFFFFF',
      fontFamily: FONT,
    }),
  });
}

const NP_EVENT_RECAP: RenderTemplate = {
  key: 'np_event_recap',
  mode: 'nonprofit',
  name: 'Event Recap Hype',
  description: 'Fast-paced highlight reel for post-event social. Pulls celebration moments and crowd energy.',
  pacing: 'fast',
  captionTone: 'emotional',
  defaultCTAKey: 'register_now',
  build: (input) =>
    buildNonprofitClip(input, {
      captionTone: 'emotional',
      headlineBg: '#0066FF',
      headlineColor: '#FFFFFF',
      showHeadline: true,
      punchIn: true,
      ctaKey: 'register_now',
      pacing: 'fast',
    }),
};

const NP_JOIN_US: RenderTemplate = {
  key: 'np_join_us',
  mode: 'nonprofit',
  name: 'Join Us Recruitment',
  description: 'Group-energy clip designed to recruit volunteers/participants. Headline calls out the event name.',
  pacing: 'medium',
  captionTone: 'emotional',
  defaultCTAKey: 'join_the_ride',
  build: (input) =>
    buildNonprofitClip(input, {
      captionTone: 'emotional',
      headlineBg: '#1AAE5B',
      headlineColor: '#FFFFFF',
      showHeadline: true,
      punchIn: false,
      ctaKey: 'join_the_ride',
      pacing: 'medium',
    }),
};

const NP_WHY_THIS_MATTERS: RenderTemplate = {
  key: 'np_why_this_matters',
  mode: 'nonprofit',
  name: 'Why This Matters',
  description: 'Slow, mission-forward clip. Front-loads the mission text overlay; donate CTA.',
  pacing: 'slow',
  captionTone: 'emotional',
  defaultCTAKey: 'donate_today',
  build: (input) =>
    buildNonprofitClip(input, {
      captionTone: 'emotional',
      headlineBg: '#000000',
      headlineColor: '#FFFFFF',
      showHeadline: true,
      punchIn: false,
      ctaKey: 'donate_today',
      pacing: 'slow',
    }),
};

const NP_SPONSOR_HIGHLIGHT: RenderTemplate = {
  key: 'np_sponsor_highlight',
  mode: 'nonprofit',
  name: 'Sponsor Highlight',
  description: 'Calls out a sponsor (from context.sponsor_name) with a sponsorship CTA.',
  pacing: 'medium',
  captionTone: 'informational',
  defaultCTAKey: 'become_sponsor',
  build: (input) => {
    const ctx = input.context as Record<string, string | undefined>;
    const sponsor = ctx.sponsor_name ? `Powered by ${ctx.sponsor_name}` : (ctx.event_name || '');
    return buildNonprofitClip(input, {
      captionTone: 'informational',
      headlineText: sponsor,
      headlineBg: '#FFB400',
      headlineColor: '#1A1A1A',
      showHeadline: Boolean(sponsor),
      punchIn: false,
      ctaKey: 'become_sponsor',
      pacing: 'medium',
    });
  },
};

const NP_TESTIMONIAL: RenderTemplate = {
  key: 'np_testimonial',
  mode: 'nonprofit',
  name: 'Testimonial Clip',
  description: 'Single-voice testimonial. No headline, lower-third caption, donate CTA.',
  pacing: 'slow',
  captionTone: 'informational',
  defaultCTAKey: 'donate_today',
  build: (input) =>
    buildNonprofitClip(input, {
      captionTone: 'informational',
      headlineBg: '#000000',
      headlineColor: '#FFFFFF',
      showHeadline: false,
      punchIn: false,
      ctaKey: 'donate_today',
      pacing: 'slow',
    }),
};

export const NONPROFIT_TEMPLATES: RenderTemplate[] = [
  NP_EVENT_RECAP,
  NP_JOIN_US,
  NP_WHY_THIS_MATTERS,
  NP_SPONSOR_HIGHLIGHT,
  NP_TESTIMONIAL,
];

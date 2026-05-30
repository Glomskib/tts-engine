/**
 * Zebby's World template pack — character-driven chronic-illness shorts.
 *
 * Four templates, each shaped to one of the content types produced by
 * scoring.ts::classifyClipType('zebby', ...):
 *
 *   - zebby_character_moment  → follow_herd CTA  (brand-protective default)
 *   - zebby_symptom_explainer → install_app CTA  ("track this with Zebby")
 *   - zebby_educational       → install_app CTA  ("learn more in Zebby's World")
 *   - zebby_skit              → follow_herd CTA  (multi-character dialogue)
 *
 * Visual style follows prompts/zebby_style.md: soft, pastel-friendly palette
 * (EDS purple primary, warm peach accent, soft teal for educational), rounded
 * forms, no harsh contrast. Brand-config color tokens are imported from
 * lib/zebby/brand-config so a single palette update propagates here.
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
import { ZEBBY_COLORS } from '@/lib/zebby/brand-config';

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

interface ZebbyOpts {
  captionTone: 'emotional' | 'informational' | 'casual';
  headlineText?: string;
  headlineBg: string;
  headlineColor: string;
  showHeadline: boolean;
  punchIn: boolean;
  ctaKey: string;
  ctaBackground: string;
}

function buildZebbyClip(input: TemplateBuildInput, opts: ZebbyOpts) {
  const length = input.candidate.end - input.candidate.start;
  // Slightly longer CTA card than nonprofit (1.8s) — gives the brand color
  // time to land emotionally before the clip ends. Chronic-illness audience
  // rewards softer pacing.
  const ctaDuration = 1.8;
  const ctaStart = Math.max(0, length - ctaDuration);

  // Per-render override wins; falls back to template's default CTA.
  const cta = getCTAOrDefault(input.ctaKey || opts.ctaKey, 'zebby');

  const captionStyle =
    opts.captionTone === 'emotional'
      ? { fontFamily: FONT, fontSize: 68, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'normal' as const, weight: 700, yPosition: 0.82 }
      : opts.captionTone === 'casual'
        ? { fontFamily: FONT, fontSize: 70, color: '#FFFFFF', background: 'rgba(0,0,0,0)', textCase: 'normal' as const, weight: 700, yPosition: 0.80 }
        : { fontFamily: FONT, fontSize: 58, color: '#FFFFFF', background: 'rgba(0,0,0,0.55)', textCase: 'normal' as const, weight: 600, yPosition: 0.86 };

  // Headline can be overridden by run.context_json
  // (episode_title, character_focus, segment_label) — useful when an episode
  // ingestion knows which segment of the source it's pulling from.
  const ctx = input.context as Record<string, string | undefined>;
  const headlineText =
    opts.headlineText ||
    ctx.episode_title ||
    ctx.segment_label ||
    input.candidate.hookText ||
    '';

  return composeTimeline({
    video: videoClip(input, { punchIn: opts.punchIn }),
    captions: captionClips(input.candidate.text, ctaStart, captionStyle),
    headline:
      opts.showHeadline && headlineText
        ? headlineClip(headlineText, {
            fontFamily: FONT,
            fontSize: 54,
            color: opts.headlineColor,
            background: opts.headlineBg,
            textCase: 'upper',
          })
        : null,
    ctaCard: ctaCardClip(cta, ctaStart, ctaDuration, {
      background: opts.ctaBackground,
      color: '#FFFFFF',
      fontFamily: FONT,
    }),
  });
}

// ---------------------------------------------------------------------------
// Template 1: Character Moment (default)
// ---------------------------------------------------------------------------
// Pure emotional resonance. The herd-building cut. No app push — brand voice
// stays warm and inclusive. Used for: Zebby reacting, Spoonie offering
// support, Bracer providing reassurance, slice-of-life moments.

const ZEBBY_CHARACTER_MOMENT: RenderTemplate = {
  key: 'zebby_character_moment',
  mode: 'zebby',
  name: 'Character Moment',
  description:
    'Brand-protective character cut. Emotional caption, soft EDS-purple headline, "Join the Herd" CTA. The default Zebby short — no product push, audience growth first.',
  pacing: 'slow',
  captionTone: 'emotional',
  defaultCTAKey: 'follow_herd',
  build: (input) =>
    buildZebbyClip(input, {
      captionTone: 'emotional',
      headlineBg: ZEBBY_COLORS.edsPurple,
      headlineColor: '#FFFFFF',
      showHeadline: true,
      punchIn: false,
      ctaKey: 'follow_herd',
      ctaBackground: ZEBBY_COLORS.charcoal,
    }),
};

// ---------------------------------------------------------------------------
// Template 2: Symptom Explainer
// ---------------------------------------------------------------------------
// Educational moment about a specific symptom (POTS heart rate, EDS joint
// subluxation, brain fog, fatigue crash). App-install CTA — "track this with
// Zebby." Lower-third caption keeps the visual focus on Zebby explaining.

const ZEBBY_SYMPTOM_EXPLAINER: RenderTemplate = {
  key: 'zebby_symptom_explainer',
  mode: 'zebby',
  name: 'Symptom Explainer',
  description:
    'Educational cut for a specific symptom. Lower-third informational caption, soft teal headline, "Try Zebby" app-install CTA. Targets discovery-stage spoonies looking for symptom info.',
  pacing: 'medium',
  captionTone: 'informational',
  defaultCTAKey: 'install_app',
  build: (input) =>
    buildZebbyClip(input, {
      captionTone: 'informational',
      headlineBg: ZEBBY_COLORS.softTeal,
      headlineColor: ZEBBY_COLORS.charcoal,
      showHeadline: true,
      punchIn: false,
      ctaKey: 'install_app',
      ctaBackground: ZEBBY_COLORS.charcoal,
    }),
};

// ---------------------------------------------------------------------------
// Template 3: Educational
// ---------------------------------------------------------------------------
// Broader "here's how / the truth about" educational shape — chronic illness
// patterns, pacing principles, the spoon theory, doctor-prep tips. App
// install CTA. Slightly more energetic than symptom-explainer (these need a
// hook to compete with the broader chronic-illness content pool).

const ZEBBY_EDUCATIONAL: RenderTemplate = {
  key: 'zebby_educational',
  mode: 'zebby',
  name: 'Educational',
  description:
    'Punchier educational cut — pacing tips, spoon theory, doctor-prep. Bolder informational caption, warm-peach headline, "Try Zebby" CTA. Compete with the broader chronic-illness educational pool.',
  pacing: 'medium',
  captionTone: 'informational',
  defaultCTAKey: 'install_app',
  build: (input) =>
    buildZebbyClip(input, {
      captionTone: 'informational',
      headlineBg: ZEBBY_COLORS.warmPeach,
      headlineColor: '#FFFFFF',
      showHeadline: true,
      punchIn: true,
      ctaKey: 'install_app',
      ctaBackground: ZEBBY_COLORS.charcoal,
    }),
};

// ---------------------------------------------------------------------------
// Template 4: Skit
// ---------------------------------------------------------------------------
// Multi-character dialogue (Zebby ↔ Spoonie ↔ Bracer). Casual caption tone
// keeps the comedic timing intact. No headline (dialogue carries it).
// Follow-herd CTA — skits are pure audience growth fuel, no conversion ask.

const ZEBBY_SKIT: RenderTemplate = {
  key: 'zebby_skit',
  mode: 'zebby',
  name: 'Skit',
  description:
    'Multi-character dialogue cut (Zebby/Spoonie/Bracer banter). Casual caption tone, no headline (let the dialogue carry), "Join the Herd" CTA. Pure audience-growth content.',
  pacing: 'fast',
  captionTone: 'casual',
  defaultCTAKey: 'follow_herd',
  build: (input) =>
    buildZebbyClip(input, {
      captionTone: 'casual',
      headlineBg: ZEBBY_COLORS.edsPurple,
      headlineColor: '#FFFFFF',
      showHeadline: false,
      punchIn: false,
      ctaKey: 'follow_herd',
      ctaBackground: ZEBBY_COLORS.charcoal,
    }),
};

export const ZEBBY_TEMPLATES: RenderTemplate[] = [
  ZEBBY_CHARACTER_MOMENT,
  ZEBBY_SYMPTOM_EXPLAINER,
  ZEBBY_EDUCATIONAL,
  ZEBBY_SKIT,
];

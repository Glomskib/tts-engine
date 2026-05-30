/**
 * @module zebby/brand-config
 *
 * Single source of truth for Zebby's World brand constants: social handles,
 * color palette, hashtag sets, and the env-driven URLs that aren't live yet
 * (app install, landing page, Kickstarter). When those launch, only this file
 * needs to know — every consumer (CTA composer, social-post caption builder,
 * admin UI) reads from here.
 *
 * Design rule: never hardcode a Zebby URL or handle outside this file. If a
 * piece of code needs the app URL or the TikTok handle, import it from here.
 *
 * Required env vars (add to Vercel + .env.example):
 *   NEXT_PUBLIC_ZEBBY_APP_URL          — e.g. https://app.zebbysworld.com (PLACEHOLDER until launch)
 *   NEXT_PUBLIC_ZEBBY_LANDING_URL      — e.g. https://zebbysworld.com (PLACEHOLDER until launch)
 *   NEXT_PUBLIC_ZEBBY_KICKSTARTER_URL  — Kickstarter campaign URL (PLACEHOLDER until launch)
 *
 * Until those env vars are set, the corresponding URL getter returns null and
 * the caption builder falls back to "Link in bio" copy with no clickable URL.
 */

// ---------------------------------------------------------------------------
// Social handles (live today)
// ---------------------------------------------------------------------------

export const ZEBBY_HANDLES = {
  tiktok: '@zebbysworld',
  instagram: '@zebbysworld',
  youtube: '@zebbysworld',
  facebook: 'zebbysworld',
} as const;

export const ZEBBY_YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@zebbysworld';

// ---------------------------------------------------------------------------
// Pre-launch URLs (env-driven, may be null until launch)
// ---------------------------------------------------------------------------

/** App install URL. Returns null pre-launch — caption builder must handle null. */
export function getZebbyAppUrl(): string | null {
  return process.env.NEXT_PUBLIC_ZEBBY_APP_URL || null;
}

/** Landing page URL. Returns null pre-launch. */
export function getZebbyLandingUrl(): string | null {
  return process.env.NEXT_PUBLIC_ZEBBY_LANDING_URL || null;
}

/** Kickstarter campaign URL. Returns null until the campaign is live. */
export function getZebbyKickstarterUrl(): string | null {
  return process.env.NEXT_PUBLIC_ZEBBY_KICKSTARTER_URL || null;
}

/** Has the app launched? Used by UI/copy to swap pre-launch language for live. */
export function isAppLive(): boolean {
  return Boolean(getZebbyAppUrl());
}

// ---------------------------------------------------------------------------
// Color palette — matches prompts/zebby_style.md
// ---------------------------------------------------------------------------

export const ZEBBY_COLORS = {
  edsPurple: '#B68FFF',    // primary brand / awareness color
  warmPeach: '#FF8C5A',    // CTA accent / energy
  softTeal: '#6BC4D6',     // educational / calm
  mutedGold: '#F2C94C',    // Kickstarter / premium
  cream: '#FAF6EE',        // background tone
  charcoal: '#2D2A35',     // text on light bg
} as const;

// ---------------------------------------------------------------------------
// Hashtag sets — used by caption builder for each platform
// ---------------------------------------------------------------------------

/**
 * Core hashtags every Zebby post should carry. Drawn from the live YouTube
 * channel description for consistency with existing brand presence.
 */
export const ZEBBY_HASHTAGS_CORE = [
  '#ZebbysWorld',
  '#EDS',
  '#EhlersDanlosSyndrome',
  '#SpoonieLife',
  '#ChronicIllnessAwareness',
] as const;

/** Symptom-explainer + educational clips lean medical-community discoverability. */
export const ZEBBY_HASHTAGS_EDUCATIONAL = [
  '#POTS',
  '#HypermobileEDS',
  '#InvisibleIllness',
  '#ChronicPain',
  '#SpoonTheory',
] as const;

/** Character-moment + skit clips lean community/lifestyle discoverability. */
export const ZEBBY_HASHTAGS_COMMUNITY = [
  '#EDSWarrior',
  '#SpoonieCartoon',
  '#SpoonieSupport',
  '#PacingNotPushing',
  '#RestIsProductive',
  '#SpoonieCommunity',
] as const;

// ---------------------------------------------------------------------------
// Caption builders — what the social post text should say per CTA + platform.
// Pure functions; no side effects. The posting layer (Late.dev integration)
// calls these to compose the text body of each scheduled post.
// ---------------------------------------------------------------------------

export interface CaptionContext {
  platform: 'tiktok' | 'instagram' | 'shorts' | 'facebook';
  ctaKey: 'follow_herd' | 'install_app' | 'learn_more_zebby' | 'join_community' | 'back_kickstarter';
  hookText: string | null;
}

/**
 * Compose the social-post caption for a Zebby clip. Includes hook line,
 * brand-voice CTA copy, and platform-tuned hashtag mix. Returns ready-to-post text.
 *
 * Pre-launch: if the CTA's URL isn't configured yet, the caption uses
 * "Link in bio" or "Coming soon" copy and omits the URL entirely.
 */
export function composeZebbyCaption(ctx: CaptionContext): string {
  const hook = ctx.hookText ? sanitizeHookForCaption(ctx.hookText) : '';
  const ctaLine = ctaCaptionLine(ctx.ctaKey);
  const hashtags = hashtagsForCtaAndPlatform(ctx.ctaKey, ctx.platform).join(' ');

  // Platform-tuned spacing. TikTok caps captions tightly; IG is generous.
  switch (ctx.platform) {
    case 'tiktok':
    case 'shorts':
      return [hook, ctaLine, hashtags].filter(Boolean).join('\n\n');
    case 'instagram':
      return [hook, '', ctaLine, '', hashtags].filter((l) => l !== undefined).join('\n');
    case 'facebook':
      // FB de-emphasizes hashtags; keep the post conversational.
      return [hook, '', ctaLine].filter(Boolean).join('\n');
  }
}

function sanitizeHookForCaption(hook: string): string {
  // Strip burned-in caption styling artifacts and trailing punctuation noise.
  return hook.replace(/\s+/g, ' ').trim().replace(/[.!?]{2,}$/, (m) => m[0]);
}

function ctaCaptionLine(ctaKey: CaptionContext['ctaKey']): string {
  const appUrl = getZebbyAppUrl();
  const kickstarterUrl = getZebbyKickstarterUrl();

  switch (ctaKey) {
    case 'follow_herd':
      return `🦓💜 Follow ${ZEBBY_HANDLES.tiktok} — you're part of the herd.`;
    case 'install_app':
      return appUrl
        ? `🦓 Track your spoons with Zebby — ${appUrl}`
        : `🦓 Zebby's World app — coming soon. Follow ${ZEBBY_HANDLES.tiktok} for the drop.`;
    case 'learn_more_zebby':
      return `🦓 More from Zebby + the herd → ${ZEBBY_HANDLES.tiktok}`;
    case 'join_community':
      return appUrl
        ? `💜 Find your herd inside Zebby's World — ${appUrl}`
        : `💜 The herd is gathering. Follow ${ZEBBY_HANDLES.tiktok} for the app launch.`;
    case 'back_kickstarter':
      return kickstarterUrl
        ? `🦓 Back the Zebby's World animation project → ${kickstarterUrl}`
        : `🦓 Zebby's World Kickstarter — coming soon. Follow ${ZEBBY_HANDLES.tiktok} for the launch.`;
  }
}

function hashtagsForCtaAndPlatform(
  ctaKey: CaptionContext['ctaKey'],
  platform: CaptionContext['platform'],
): readonly string[] {
  // Facebook doesn't reward hashtags; keep them tiny there.
  if (platform === 'facebook') return ZEBBY_HASHTAGS_CORE.slice(0, 2);

  switch (ctaKey) {
    case 'install_app':
    case 'learn_more_zebby':
      return [...ZEBBY_HASHTAGS_CORE, ...ZEBBY_HASHTAGS_EDUCATIONAL];
    case 'follow_herd':
    case 'join_community':
    case 'back_kickstarter':
      return [...ZEBBY_HASHTAGS_CORE, ...ZEBBY_HASHTAGS_COMMUNITY];
  }
}

// ---------------------------------------------------------------------------
// Map content-type → preferred CTA. Used by the pipeline to auto-route each
// classified clip to the right CTA without manual tagging. Templates can still
// override per-render.
// ---------------------------------------------------------------------------

export const ZEBBY_CTA_BY_CONTENT_TYPE: Record<string, CaptionContext['ctaKey']> = {
  // From scoring.ts classifyClipType('zebby', ...) labels
  character_moment: 'follow_herd',
  symptom_explainer: 'install_app',
  educational: 'install_app',
  skit: 'follow_herd',
  // Fallback for clips that didn't classify (rare — defaults to brand-protective)
  general: 'follow_herd',
};

/** Get the default CTA key for a given clip_type produced by classifyClipType. */
export function ctaForContentType(contentType: string | null | undefined): CaptionContext['ctaKey'] {
  if (!contentType) return 'follow_herd';
  return ZEBBY_CTA_BY_CONTENT_TYPE[contentType] ?? 'follow_herd';
}

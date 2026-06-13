/**
 * Avatar environments — the background a talking-head avatar is rendered INTO.
 *
 * Why this exists: every HeyGen render used to hardcode a green/white
 * background (lib/heygen.ts), so avatars came out on a blank/green screen
 * "not in any environment." An environment resolves to a HeyGen `background`
 * object that the avatar is composited onto by HeyGen itself (no fragile
 * local chroma-key):
 *   - image → { type: 'image', url, fit }              (AI-gen, stock, or upload)
 *   - video → { type: 'video', url, play_style, fit }  (looping motion bg)
 *   - color → { type: 'color', value }                 (the "Plain" preset)
 *
 * Sources (Brandon: "mix of all + they should be able to upload their own"):
 *   - 'ai'     → generate an environment-ONLY image from the preset prompt
 *                (no person — the avatar is added on top by HeyGen)
 *   - 'stock'  → a curated hosted image/video URL
 *   - 'upload' → a user-provided image/video URL
 *   - 'color'  → a solid color
 *
 * Resolution is forgiving: if an image/video source has no URL yet (e.g. the
 * AI image hasn't been generated/cached), we fall back to the preset's solid
 * color so a render NEVER breaks on a missing asset.
 */

export type HeyGenBackground =
  | { type: 'color'; value: string }
  | { type: 'image'; url: string; fit?: 'cover' | 'contain' | 'crop' | 'none' }
  | { type: 'video'; url: string; play_style?: 'loop' | 'once' | 'freeze'; fit?: 'cover' | 'contain' | 'crop' | 'none' };

export type EnvironmentSource = 'ai' | 'stock' | 'upload' | 'color';

/** A preset the user can pick. The `prompt` generates an environment-ONLY
 *  image (no people) when source = 'ai'. */
export interface EnvironmentPreset {
  id: string;
  label: string;
  /** Short blurb for the picker. */
  hint: string;
  /** Image-generation prompt — environment only, vertical 9:16, no people. */
  prompt: string;
  /** Safe solid-color fallback when no image/video URL is available yet. */
  fallbackColor: string;
}

/** A concrete environment choice stored per avatar / passed per render. */
export interface EnvironmentSelection {
  preset_id: string;
  source: EnvironmentSource;
  /** For 'ai' (once generated + cached), 'stock', or 'upload'. */
  asset_url?: string | null;
  /** Whether asset_url points at a looping video vs. a still image. */
  is_video?: boolean;
  /** For 'color'/'Plain', or a custom override. */
  color?: string | null;
}

// Vertical, no-people environment prompts. "no people / empty" is load-bearing:
// the talking avatar is composited ON TOP by HeyGen, so a person in the
// background plate would double them up.
export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'office',
    label: 'Office',
    hint: 'Clean modern office',
    prompt:
      'A modern bright office interior, tidy desk and shelving softly blurred, large window with natural daylight, professional and inviting, photographic, shallow depth of field, NO people, empty foreground, vertical 9:16 composition',
    fallbackColor: '#2B3A4A',
  },
  {
    id: 'convention',
    label: 'Convention',
    hint: 'Trade show / event hall',
    prompt:
      'A busy convention center trade-show hall, booths and banners softly blurred in the background, bright energetic event lighting, photographic, shallow depth of field, NO people in the foreground, empty foreground, vertical 9:16 composition',
    fallbackColor: '#3A2F4A',
  },
  {
    id: 'outdoor',
    label: 'Outdoor',
    hint: 'Street / outdoors',
    prompt:
      'A pleasant outdoor city street with greenery and soft warm daylight, gentle bokeh, photographic, shallow depth of field, NO people, empty foreground, vertical 9:16 composition',
    fallbackColor: '#2F4A3A',
  },
  {
    id: 'cafe',
    label: 'Café',
    hint: 'Cozy coffee shop',
    prompt:
      'A cozy cafe interior, warm ambient light, blurred coffee-shop background with soft bokeh, photographic, shallow depth of field, NO people, empty foreground, vertical 9:16 composition',
    fallbackColor: '#4A3A2B',
  },
  {
    id: 'studio',
    label: 'Studio',
    hint: 'Clean studio backdrop',
    prompt:
      'A soft-lit professional photo studio, smooth neutral gradient backdrop, subtle vignette, clean and minimal, photographic, NO people, empty foreground, vertical 9:16 composition',
    fallbackColor: '#202A33',
  },
  {
    id: 'plain',
    label: 'Plain',
    hint: 'Solid color',
    prompt: '', // Plain never generates an image.
    fallbackColor: '#1B2027',
  },
];

export const DEFAULT_ENVIRONMENT_ID = 'studio';

const PRESET_BY_ID = new Map(ENVIRONMENT_PRESETS.map((p) => [p.id, p]));

export function getEnvironmentPreset(id?: string | null): EnvironmentPreset {
  return (id && PRESET_BY_ID.get(id)) || PRESET_BY_ID.get(DEFAULT_ENVIRONMENT_ID)!;
}

/** The image-generation prompt for a preset (environment only, no avatar). */
export function environmentImagePrompt(presetId: string): string {
  return getEnvironmentPreset(presetId).prompt;
}

/**
 * Resolve an environment selection to a HeyGen `background` object.
 * Falls back to the preset's solid color whenever an image/video source is
 * chosen but no URL is available yet — a render is never blocked on a missing
 * background asset.
 */
export function resolveHeyGenBackground(
  sel?: EnvironmentSelection | null,
): HeyGenBackground {
  const preset = getEnvironmentPreset(sel?.preset_id);

  if (!sel) return { type: 'color', value: preset.fallbackColor };

  // Explicit plain/color choice.
  if (sel.source === 'color') {
    return { type: 'color', value: sel.color || preset.fallbackColor };
  }

  // Image/video sources need a URL. If present, use it; else fall back safely.
  const url = (sel.asset_url || '').trim();
  if ((sel.source === 'ai' || sel.source === 'stock' || sel.source === 'upload') && url) {
    return sel.is_video
      ? { type: 'video', url, play_style: 'loop', fit: 'cover' }
      : { type: 'image', url, fit: 'cover' };
  }

  return { type: 'color', value: sel.color || preset.fallbackColor };
}

/** Convenience: a HeyGen background for a bare preset id (no custom asset). */
export function backgroundForPreset(presetId?: string | null): HeyGenBackground {
  return { type: 'color', value: getEnvironmentPreset(presetId).fallbackColor };
}

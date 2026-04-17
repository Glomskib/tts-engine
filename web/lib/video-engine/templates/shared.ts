/**
 * Shotstack helpers shared across all templates.
 *
 * Templates produce 9:16 timelines composed of:
 *   - source video clip (9:16 crop, optional punch-in)
 *   - caption track (chunked transcript, burned in)
 *   - headline overlay (top, brief, brand-shaped)
 *   - CTA card (last 1.5s, full-bleed)
 *
 * All overlay text uses Shotstack's `html` asset so we don't depend on hosted
 * image generation — keeps render queue self-contained.
 */

import type { CTA, ShotstackTimeline, TemplateBuildInput } from '../types';

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;        // px in 1080-wide canvas
  color: string;           // text color
  background: string;      // box bg (e.g. 'rgba(0,0,0,0.7)')
  textCase: 'upper' | 'normal';
  weight: number;          // 400-900
  yPosition: number;       // 0..1, distance from top
}

export interface HeadlineStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  background: string;
  textCase: 'upper' | 'normal';
}

export interface CTAStyle {
  background: string;
  color: string;
  fontFamily: string;
}

export const CANVAS = { width: 1080, height: 1920 };

/** Build the source video clip with 9:16 crop. */
export function videoClip(input: TemplateBuildInput, opts: { punchIn?: boolean } = {}): Record<string, unknown> {
  const { candidate, asset } = input;
  const length = Math.max(0.5, candidate.end - candidate.start);

  const clip: Record<string, unknown> = {
    asset: {
      type: 'video',
      src: asset.storage_url,
      trim: candidate.start,
      volume: 1,
    },
    start: 0,
    length,
    fit: 'cover',
    scale: opts.punchIn ? 1.12 : 1.0,
  };

  return clip;
}

/** Chunk caption text into ~3 word phrases with timing distributed across the clip. */
export function captionClips(
  text: string,
  totalLength: number,
  style: CaptionStyle,
): Array<Record<string, unknown>> {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const phrases: string[] = [];
  for (let i = 0; i < words.length; i += 3) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }
  if (phrases.length === 0) return [];

  const perPhrase = totalLength / phrases.length;

  return phrases.map((phrase, i) => {
    const display = style.textCase === 'upper' ? phrase.toUpperCase() : phrase;
    const html = `<div style="font-family:${style.fontFamily};font-weight:${style.weight};font-size:${style.fontSize}px;color:${style.color};text-align:center;line-height:1.15;text-shadow:0 3px 8px rgba(0,0,0,0.85);">${escapeHtml(display)}</div>`;

    return {
      asset: {
        type: 'html',
        html,
        background: style.background,
        width: CANVAS.width - 80,
        height: 220,
      },
      start: Number((i * perPhrase).toFixed(3)),
      length: Number(perPhrase.toFixed(3)),
      position: 'center',
      offset: { y: -(0.5 - style.yPosition) },
    };
  });
}

/** Headline overlay shown for the first ~2s of the clip. */
export function headlineClip(
  text: string,
  style: HeadlineStyle,
  durationSec = 2,
): Record<string, unknown> {
  const display = style.textCase === 'upper' ? text.toUpperCase() : text;
  const html = `<div style="font-family:${style.fontFamily};font-weight:800;font-size:${style.fontSize}px;color:${style.color};text-align:center;padding:20px 28px;border-radius:14px;line-height:1.1;">${escapeHtml(display)}</div>`;

  return {
    asset: {
      type: 'html',
      html,
      background: style.background,
      width: CANVAS.width - 120,
      height: 280,
    },
    start: 0,
    length: durationSec,
    position: 'top',
    offset: { y: -0.05 },
    transition: { in: 'fade', out: 'fade' },
  };
}

/** Full-bleed CTA card appended to the end of the clip. */
export function ctaCardClip(
  cta: CTA,
  startAt: number,
  durationSec = 1.6,
  style: CTAStyle = { background: '#000000', color: '#FFFFFF', fontFamily: 'Inter, Arial, sans-serif' },
): Record<string, unknown> {
  const html = `
    <div style="font-family:${style.fontFamily};display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
      <div style="font-weight:900;font-size:120px;color:${cta.accentColor};letter-spacing:1px;text-align:center;line-height:1;">${escapeHtml(cta.overlayText)}</div>
      ${cta.subtitle ? `<div style="margin-top:24px;font-weight:600;font-size:48px;color:${style.color};opacity:0.85;text-align:center;">${escapeHtml(cta.subtitle)}</div>` : ''}
    </div>
  `;

  return {
    asset: {
      type: 'html',
      html,
      background: style.background,
      width: CANVAS.width,
      height: CANVAS.height,
    },
    start: startAt,
    length: durationSec,
    position: 'center',
    transition: { in: 'fade' },
  };
}

/**
 * Watermark badge — pinned to the bottom-right of the source video clip
 * for the entire duration. Used on Starter/PAYG renders.
 */
export function watermarkClip(text: string, totalLength: number): Record<string, unknown> {
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-weight:700;font-size:30px;color:#FFFFFF;padding:10px 18px;border-radius:10px;letter-spacing:0.5px;text-shadow:0 2px 6px rgba(0,0,0,0.85);">${escapeHtml(text)}</div>`;
  return {
    asset: {
      type: 'html',
      html,
      background: 'rgba(0,0,0,0.55)',
      width: 360,
      height: 70,
    },
    start: 0,
    length: totalLength,
    position: 'bottomRight',
    offset: { x: -0.02, y: 0.02 },
  };
}

/** Compose all the pieces into a final timeline. */
export function composeTimeline(layers: {
  video: Record<string, unknown>;
  captions: Array<Record<string, unknown>>;
  headline?: Record<string, unknown> | null;
  ctaCard?: Record<string, unknown> | null;
  watermark?: Record<string, unknown> | null;
}): ShotstackTimeline {
  const tracks: Array<{ clips: Array<Record<string, unknown>> }> = [];

  // Order matters in Shotstack: bottom-most track first.
  tracks.push({ clips: [layers.video] });
  if (layers.captions.length) tracks.push({ clips: layers.captions });
  if (layers.headline) tracks.push({ clips: [layers.headline] });
  if (layers.watermark) tracks.push({ clips: [layers.watermark] });
  if (layers.ctaCard) tracks.push({ clips: [layers.ctaCard] });

  return {
    background: '#000000',
    tracks,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

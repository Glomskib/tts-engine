/**
 * Compose a Shotstack video with text overlays and optional audio.
 * Shared between the compose API route and the check-renders cron.
 */
import { shotstackRequest } from "@/lib/shotstack";

export interface SfxClip {
  url: string;
  start: number;
  length: number;
  volume: number;
}

export interface ComposeParams {
  videoUrl: string;
  audioUrl?: string;
  onScreenText?: string;
  cta?: string;
  duration?: number;
  productImageUrl?: string;
  sfxClips?: SfxClip[];
}

export interface ComposeResult {
  ok: true;
  renderId: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TEXT_CARD_CSS = `
p { font-family: Montserrat; font-weight: 700; font-size: 52px;
    color: #ffffff; text-align: center; line-height: 1.3;
    padding: 16px 32px; margin: 0; }
`.trim();

const CTA_CSS = `
p { font-family: Montserrat; font-weight: 700; font-size: 56px;
    color: #ffffff; text-align: center; line-height: 1.3;
    padding: 20px 40px; margin: 0; }
`.trim();

function textCardAsset(text: string) {
  return {
    type: "html" as const,
    html: `<p>${escapeHtml(text)}</p>`,
    css: TEXT_CARD_CSS,
    width: 800,
    height: 120,
    background: "#000000",
  };
}

function ctaAsset(text: string) {
  return {
    type: "html" as const,
    html: `<p>${escapeHtml(text)}</p>`,
    css: CTA_CSS,
    width: 800,
    height: 140,
    background: "#000000",
  };
}

function buildTextCards(
  raw: string,
  videoDuration: number,
  ctaDuration: number
): { text: string; start: number; length: number }[] {
  const segments = raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const textWindow = Math.max(videoDuration - ctaDuration - 0.5, 2);
  const cardDuration = Math.min(textWindow / segments.length, 4);
  const gap = 0.3;

  return segments.map((seg, i) => ({
    text: seg,
    start: 0.5 + i * (cardDuration + gap),
    length: cardDuration,
  }));
}

function buildProductImageClips(
  imageUrl: string,
  videoDuration: number,
  ctaLength: number
) {
  const clips: Record<string, unknown>[] = [];

  // Hook appearance: 0.3s → ~3.3s, bottom-left
  clips.push({
    asset: { type: "image", src: imageUrl },
    start: 0.3,
    length: 3,
    position: "bottomLeft",
    offset: { x: 0.05, y: 0.08 },
    scale: 0.28,
    opacity: 0.92,
    fit: "contain",
    transition: { in: "fade", out: "fade" },
  });

  // CTA appearance: last 3.5s, bottom-right
  const ctaStart = Math.max(0, videoDuration - ctaLength);
  clips.push({
    asset: { type: "image", src: imageUrl },
    start: ctaStart,
    length: Math.min(ctaLength, videoDuration),
    position: "bottomRight",
    offset: { x: -0.05, y: 0.08 },
    scale: 0.28,
    opacity: 0.92,
    fit: "contain",
    transition: { in: "fade", out: "fade" },
  });

  return clips;
}

/**
 * Submit a compose render to Shotstack. Returns the render ID.
 * Throws on failure.
 */
export async function submitCompose(params: ComposeParams): Promise<ComposeResult> {
  const { videoUrl, audioUrl, onScreenText, cta, productImageUrl, sfxClips } = params;
  const duration = params.duration ?? 10;
  const ctaLength = 3.5;

  const tracks: Record<string, unknown>[] = [];

  // SFX audio track — subtle ambient sound effects
  if (sfxClips?.length) {
    tracks.unshift({
      clips: sfxClips.map((clip) => ({
        asset: { type: "audio", src: clip.url, volume: clip.volume },
        start: clip.start,
        length: clip.length,
      })),
    });
  }

  if (cta) {
    tracks.push({
      clips: [
        {
          asset: ctaAsset(cta),
          start: Math.max(0, duration - ctaLength),
          length: Math.min(ctaLength, duration),
          position: "center",
          opacity: 0.85,
          transition: { in: "fade", out: "fade" },
        },
      ],
    });
  }

  if (onScreenText) {
    const cards = buildTextCards(onScreenText, duration, cta ? ctaLength : 0);
    tracks.push({
      clips: cards.map((card) => ({
        asset: textCardAsset(card.text),
        start: card.start,
        length: card.length,
        position: "bottom",
        offset: { y: 0.15 },
        opacity: 0.85,
        transition: { in: "fade", out: "fade" },
      })),
    });
  }

  if (productImageUrl) {
    tracks.push({
      clips: buildProductImageClips(productImageUrl, duration, ctaLength),
    });
  }

  tracks.push({
    clips: [
      {
        asset: { type: "video", src: videoUrl, volume: 1 },
        start: 0,
        length: duration,
        fit: "cover",
      },
    ],
  });

  const timeline: Record<string, unknown> = {
    background: "#000000",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw5aXo.woff2",
      },
    ],
    tracks,
  };

  if (audioUrl) {
    timeline.soundtrack = { src: audioUrl, effect: "fadeOut" };
  }

  const output = {
    format: "mp4",
    resolution: "hd",
    aspectRatio: "9:16",
    fps: 30,
  };

  const response = await shotstackRequest("/render", {
    method: "POST",
    body: JSON.stringify({ timeline, output }),
  });

  return {
    ok: true,
    renderId: response.response?.id || response.id,
  };
}

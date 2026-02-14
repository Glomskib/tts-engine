/**
 * Compose V2 — Multi-layer Shotstack video: B-roll + avatar PiP + captions + on-screen text.
 * Creates a TikTok-native format with talking-head, cycling B-roll background, and text overlays.
 */
import { shotstackRequest } from "@/lib/shotstack";

export interface ComposeV2Params {
  heygenUrl: string;
  brollClips: string[];
  onScreenText?: string[];
  captions?: string[];
  duration?: number;
}

export interface ComposeV2Result {
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

const MONTSERRAT_FONT_URL =
  "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Hw5aXo.woff2";

const ON_SCREEN_TEXT_CSS = `
p { font-family: Montserrat; font-weight: 700; font-size: 56px;
    color: #ffffff; text-align: center; line-height: 1.3;
    padding: 16px 32px; margin: 0; }
`.trim();

const CAPTION_CSS = `
p { font-family: Montserrat; font-weight: 600; font-size: 36px;
    color: #ffffff; text-align: center; line-height: 1.4;
    padding: 12px 24px; margin: 0;
    text-shadow: 2px 2px 6px rgba(0,0,0,0.8); }
`.trim();

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/.test(lower);
}

function buildOnScreenTextTrack(
  texts: string[],
  duration: number
): Record<string, unknown> {
  const cardDuration = duration / texts.length;
  return {
    clips: texts.map((text, i) => ({
      asset: {
        type: "html" as const,
        html: `<p>${escapeHtml(text)}</p>`,
        css: ON_SCREEN_TEXT_CSS,
        width: 900,
        height: 200,
      },
      start: i * cardDuration,
      length: cardDuration,
      position: "top",
      offset: { y: -0.15 },
      transition: { in: "fade", out: "fade" },
    })),
  };
}

function buildCaptionsTrack(
  captions: string[],
  duration: number
): Record<string, unknown> {
  const captionDuration = duration / captions.length;
  return {
    clips: captions.map((line, i) => ({
      asset: {
        type: "html" as const,
        html: `<p>${escapeHtml(line)}</p>`,
        css: CAPTION_CSS,
        width: 900,
        height: 160,
      },
      start: i * captionDuration,
      length: captionDuration,
      position: "bottom",
      offset: { y: 0.25 },
      transition: { in: "fade", out: "fade" },
    })),
  };
}

function buildAvatarTrack(
  heygenUrl: string,
  duration: number
): Record<string, unknown> {
  return {
    clips: [
      {
        asset: { type: "video", src: heygenUrl, volume: 1 },
        start: 0,
        length: duration,
        scale: 0.4,
        position: "bottomRight",
        offset: { x: -0.03, y: 0.03 },
      },
    ],
  };
}

function buildBrollTrack(
  clips: string[],
  duration: number
): Record<string, unknown> {
  const clipDuration = duration / clips.length;
  return {
    clips: clips.map((url, i) => ({
      asset: {
        type: isImageUrl(url) ? ("image" as const) : ("video" as const),
        src: url,
        ...(isImageUrl(url) ? {} : { volume: 0 }),
      },
      start: i * clipDuration,
      length: clipDuration,
      fit: "cover",
      transition: { in: "fade", out: "fade" },
    })),
  };
}

/**
 * Submit a compose-v2 render to Shotstack. Returns the render ID.
 * Throws on failure.
 */
export async function submitComposeV2(
  params: ComposeV2Params
): Promise<ComposeV2Result> {
  const { heygenUrl, brollClips, onScreenText, captions } = params;
  const duration = params.duration ?? 10;

  // Build tracks in render order (first = top layer)
  const tracks: Record<string, unknown>[] = [];

  // Track 0 — on-screen text (top layer)
  if (onScreenText?.length) {
    tracks.push(buildOnScreenTextTrack(onScreenText, duration));
  }

  // Track 1 — captions
  if (captions?.length) {
    tracks.push(buildCaptionsTrack(captions, duration));
  }

  // Track 2 — avatar PiP
  tracks.push(buildAvatarTrack(heygenUrl, duration));

  // Track 3 — B-roll background (bottom layer)
  tracks.push(buildBrollTrack(brollClips, duration));

  const timeline = {
    background: "#000000",
    fonts: [{ src: MONTSERRAT_FONT_URL }],
    tracks,
  };

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

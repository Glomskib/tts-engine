/**
 * Compose V2 — Runway full-screen UGC video with text overlays.
 * 3-layer timeline: on-screen text, captions, Runway base video.
 */
import { shotstackRequest } from "@/lib/shotstack";

export interface ComposeV2Params {
  videoUrl: string;          // Runway video URL (full-screen base, has audio)
  onScreenText?: string[];   // Key phrases (top-center)
  captions?: string[];       // Caption lines (lower-center)
  duration?: number;         // Total duration (default 10s)
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
    padding: 16px 32px; margin: 0;
    text-shadow: 2px 2px 8px rgba(0,0,0,0.9); }
`.trim();

const CAPTION_CSS = `
p { font-family: Montserrat; font-weight: 600; font-size: 36px;
    color: #ffffff; text-align: center; line-height: 1.4;
    padding: 12px 24px; margin: 0;
    text-shadow: 2px 2px 6px rgba(0,0,0,0.8); }
`.trim();

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
      offset: { y: 0.15 },
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
  const { videoUrl, onScreenText, captions } = params;
  const duration = params.duration ?? 10;

  const tracks: Record<string, unknown>[] = [];

  // Track 0 — on-screen text (top layer)
  if (onScreenText?.length) {
    tracks.push(buildOnScreenTextTrack(onScreenText, duration));
  }

  // Track 1 — captions
  if (captions?.length) {
    tracks.push(buildCaptionsTrack(captions, duration));
  }

  // Track 2 — Runway video (full-screen base, audio source)
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

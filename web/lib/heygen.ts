import type { PersonaConfig } from './heygen-personas';
import { getPersona } from './heygen-personas';

const HEYGEN_BASE_URL = 'https://api.heygen.com';

export function getHeyGenConfig() {
  const apiKey = process.env.HEYGEN_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing HEYGEN_API_KEY environment variable');
  return { apiKey };
}

/**
 * Upload an audio buffer to HeyGen's asset service.
 * Returns the hosted audio URL and asset ID.
 */
export async function uploadAudio(audioBuffer: ArrayBuffer): Promise<{ url: string; asset_id: string }> {
  const config = getHeyGenConfig();

  const response = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: {
      'X-Api-Key': config.apiKey,
      'Content-Type': 'audio/mpeg',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HeyGen upload ${response.status}: ${error}`);
  }

  const data = await response.json();
  return { url: data.data?.url ?? data.url, asset_id: data.data?.asset_id ?? data.asset_id };
}

/**
 * Generate a talking-head avatar video from an audio URL.
 * Uses persona config for avatar style, expression, and positioning.
 * Returns the video_id used for polling.
 */
export async function generateVideo(
  audioUrl: string,
  avatarId?: string,
  dimension?: { width: number; height: number },
  personaId?: string
): Promise<{ video_id: string }> {
  const config = getHeyGenConfig();
  const persona = getPersona(personaId);

  // Allow explicit avatarId override, otherwise use persona's avatar
  const resolvedAvatarId = avatarId || persona.avatarId;

  const body: Record<string, unknown> = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: resolvedAvatarId,
          avatar_style: persona.avatarStyle,
          scale: persona.scale,
          offset: persona.offset,
          talking_style: persona.talkingStyle,
          expression: persona.expression,
        },
        voice: {
          type: 'audio',
          audio_url: audioUrl,
        },
        background: {
          type: 'color',
          value: '#00FF00',
        },
      },
    ],
    // 9:16 vertical — matches TikTok/Reels/Shorts format
    dimension: dimension ?? { width: 1080, height: 1920 },
  };

  const response = await fetch(`${HEYGEN_BASE_URL}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HeyGen generate ${response.status}: ${error}`);
  }

  const data = await response.json();
  const videoId = data.data?.video_id ?? data.video_id;
  if (!videoId) throw new Error('HeyGen generate returned no video_id');
  return { video_id: videoId };
}

/**
 * Check the status of a HeyGen video generation task.
 */
export async function getVideoStatus(videoId: string): Promise<{
  status: string;
  video_url: string | null;
  duration: number | null;
}> {
  const config = getHeyGenConfig();

  const response = await fetch(
    `${HEYGEN_BASE_URL}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
    {
      headers: { 'X-Api-Key': config.apiKey },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HeyGen status ${response.status}: ${error}`);
  }

  const data = await response.json();
  const inner = data.data ?? data;
  return {
    status: inner.status,
    video_url: inner.video_url ?? null,
    duration: inner.duration ?? null,
  };
}

/**
 * Poll getVideoStatus until the video is completed or fails.
 * Defaults: poll every 10s, max 4 minutes.
 */
export async function pollUntilComplete(
  videoId: string,
  maxWaitMs: number = 240_000,
  intervalMs: number = 10_000
): Promise<{ status: string; video_url: string | null; duration: number | null }> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const result = await getVideoStatus(videoId);

    if (result.status === 'completed') {
      return result;
    }

    if (result.status === 'failed' || result.status === 'error') {
      throw new Error(`HeyGen video ${videoId} failed with status: ${result.status}`);
    }

    // Still processing — wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`HeyGen video ${videoId} timed out after ${maxWaitMs / 1000}s`);
}

// Re-export persona utilities for convenience
export { getPersona, PERSONAS } from './heygen-personas';
export type { PersonaConfig } from './heygen-personas';

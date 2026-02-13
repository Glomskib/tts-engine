const HEYGEN_BASE_URL = 'https://api.heygen.com';
const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818';

export function getHeyGenConfig() {
  const apiKey = process.env.HEYGEN_API_KEY;
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
 * Returns the video_id used for polling.
 */
export async function generateVideo(
  audioUrl: string,
  avatarId: string = DEFAULT_AVATAR_ID,
  dimension?: { width: number; height: number }
): Promise<{ video_id: string }> {
  const config = getHeyGenConfig();

  const body: Record<string, unknown> = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal',
        },
        voice: {
          type: 'audio',
          audio_url: audioUrl,
        },
      },
    ],
    dimension: dimension ?? { width: 720, height: 1280 },
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

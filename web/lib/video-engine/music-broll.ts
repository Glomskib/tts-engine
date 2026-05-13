/**
 * Music + B-roll selection for /create's Post Maker mode.
 *
 * - Pixabay Music — free, no attribution, commercial-OK. ~50K tracks.
 *   API: https://pixabay.com/api/docs/#api_search_music
 *   Tracks are downloadable as MP3 via the result `audio` field.
 *
 * - Pexels Videos — free, no attribution, commercial-OK. Millions of clips.
 *   API: https://www.pexels.com/api/documentation/#videos
 *   Videos are streamable/downloadable as MP4 via `video_files[].link`.
 *
 * Each Vibe maps to specific keyword queries + cadence rules. The pipeline's
 * assembling stage calls pickMusicForVibe() + pickBrollForTranscript() to
 * fetch URLs, then downloads + composites via ffmpeg.
 *
 * Env vars:
 *   PIXABAY_API_KEY — free signup at pixabay.com/api/docs/
 *   PEXELS_API_KEY — free signup at pexels.com/api/new
 */

export type Vibe = 'hype' | 'calm' | 'real' | 'funny' | 'sad' | string;

/**
 * Map each vibe to a Pixabay music search profile.
 * `volumeDb` is how loud the music sits under the speech (lower = quieter).
 */
const VIBE_MUSIC: Record<string, { query: string; volumeDb: number; genre?: string }> = {
  hype:  { query: 'upbeat energetic',                volumeDb: -18, genre: 'electronic' },
  calm:  { query: 'ambient peaceful',                volumeDb: -22 },
  real:  { query: 'acoustic warm',                   volumeDb: -24 },
  funny: { query: 'playful quirky',                  volumeDb: -20 },
  sad:   { query: 'cinematic emotional minor',       volumeDb: -22 },
};

const VIBE_BROLL: Record<string, { keywords: string[]; clipsPerMinute: number; durationSec: number }> = {
  hype:  { keywords: ['action', 'fast', 'energy', 'sport', 'crowd'],         clipsPerMinute: 12, durationSec: 2 },
  calm:  { keywords: ['nature', 'sunset', 'ocean', 'forest', 'slow motion'], clipsPerMinute: 4,  durationSec: 4 },
  real:  { keywords: ['interview', 'conversation', 'lifestyle'],             clipsPerMinute: 3,  durationSec: 3 },
  funny: { keywords: ['reaction', 'laughing', 'playful'],                    clipsPerMinute: 8,  durationSec: 2 },
  sad:   { keywords: ['rain', 'lonely', 'gray sky', 'empty'],                clipsPerMinute: 3,  durationSec: 4 },
};

interface PixabayTrack {
  id: number;
  audio: string;
  duration: number;
  user: string;
  tags: string;
}

interface PixabayMusicResponse { hits: PixabayTrack[] }

/**
 * Pick a music track for a given vibe + clip duration.
 * Returns null if no API key or no match.
 */
export async function pickMusicForVibe(opts: {
  vibe: Vibe;
  clip_duration_sec: number;
}): Promise<{ audio_url: string; track_id: number; volume_db: number; duration_sec: number } | null> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn('[music-broll] PIXABAY_API_KEY not set — skipping music');
    return null;
  }
  const profile = VIBE_MUSIC[opts.vibe] || VIBE_MUSIC.real;
  const url = `https://pixabay.com/api/music/?key=${apiKey}&q=${encodeURIComponent(profile.query)}&per_page=20`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as PixabayMusicResponse;
    if (!data.hits?.length) return null;
    // Prefer tracks at least as long as the clip; otherwise pick longest.
    const candidates = data.hits.filter((t) => t.duration >= opts.clip_duration_sec);
    const chosen = (candidates.length > 0 ? candidates : data.hits)[Math.floor(Math.random() * Math.min(5, (candidates.length > 0 ? candidates : data.hits).length))];
    return {
      audio_url: chosen.audio,
      track_id: chosen.id,
      volume_db: profile.volumeDb,
      duration_sec: chosen.duration,
    };
  } catch (err) {
    console.warn('[music-broll] Pixabay fetch failed:', err);
    return null;
  }
}

interface PexelsVideoFile { link: string; quality: string; file_type: string; width: number; height: number }
interface PexelsVideo {
  id: number;
  duration: number;
  width: number;
  height: number;
  video_files: PexelsVideoFile[];
}
interface PexelsResponse { videos: PexelsVideo[] }

/**
 * Pick B-roll clips for a transcript's runtime. Returns a list of cutaway
 * URLs + suggested cut points along the timeline.
 */
export async function pickBrollForTranscript(opts: {
  vibe: Vibe;
  transcript_text: string;
  total_duration_sec: number;
  vertical?: boolean;
}): Promise<Array<{ at_sec: number; duration_sec: number; video_url: string; pexels_id: number }>> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('[music-broll] PEXELS_API_KEY not set — skipping B-roll');
    return [];
  }
  const profile = VIBE_BROLL[opts.vibe] || VIBE_BROLL.real;
  const minutes = Math.max(1, opts.total_duration_sec / 60);
  const targetCount = Math.round(minutes * profile.clipsPerMinute);
  if (targetCount === 0) return [];

  // Build a query from vibe keywords + topical terms from transcript (very rough).
  const transcriptTerms = (opts.transcript_text || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 5 && !/^(about|because|something|whatever|actually)$/.test(w))
    .slice(0, 3);
  const query = [...profile.keywords.slice(0, 2), ...transcriptTerms].join(' ');

  const orientation = opts.vertical ? 'portrait' : 'landscape';
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${Math.min(targetCount * 2, 40)}&orientation=${orientation}`;

  try {
    const resp = await fetch(url, { headers: { Authorization: apiKey } });
    if (!resp.ok) return [];
    const data = await resp.json() as PexelsResponse;
    if (!data.videos?.length) return [];

    // Pick `targetCount` clips, prefer ones at least 4 sec long with HD quality
    const usable = data.videos
      .filter((v) => v.duration >= 3)
      .map((v) => {
        const hd = v.video_files.find((f) => /hd/i.test(f.quality) && /video/i.test(f.file_type))
                || v.video_files.find((f) => /video/i.test(f.file_type))
                || v.video_files[0];
        return { id: v.id, duration: v.duration, link: hd?.link };
      })
      .filter((v) => v.link)
      .slice(0, targetCount);

    // Spread cut points evenly across the timeline
    const spacing = opts.total_duration_sec / (usable.length + 1);
    return usable.map((v, idx) => ({
      at_sec: spacing * (idx + 1),
      duration_sec: Math.min(profile.durationSec, v.duration),
      video_url: v.link!,
      pexels_id: v.id,
    }));
  } catch (err) {
    console.warn('[music-broll] Pexels fetch failed:', err);
    return [];
  }
}

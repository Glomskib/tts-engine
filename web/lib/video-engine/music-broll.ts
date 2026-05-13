/**
 * Music + B-roll selection for /create's Post Maker mode.
 *
 * B-roll:
 *   - Pexels Videos (primary) — free, no attribution, ~5M clips
 *     https://www.pexels.com/api/documentation/#videos
 *   - Pixabay Videos (fallback) — free, no attribution, ~200K clips
 *     https://pixabay.com/api/docs/#api_search_videos
 *
 * Music:
 *   - Curated R2 bundle (v1) — 50 royalty-free tracks (10 per Vibe) uploaded
 *     to our R2 bucket under music-bundle/<vibe>/<idx>.mp3 paths. Zero API
 *     dependency, zero per-render cost. Bundle is populated once via
 *     scripts/seed-music-bundle.ts.
 *   - Pixabay's public music API IS NOT accessible — their docs only expose
 *     images + videos. Music has to be scraped at site-walk time, then we
 *     serve from R2.
 *
 * Each Vibe maps to keyword queries (for video) and a specific R2 folder
 * (for music). Pipeline calls pickMusicForVibe() + pickBrollForTranscript()
 * to fetch URLs, downloads, composites via ffmpeg in the assembling stage.
 *
 * Env vars:
 *   PEXELS_API_KEY — free signup at pexels.com/api/new
 *   PIXABAY_API_KEY — free signup at pixabay.com/api/docs/
 *   R2_BUCKET, R2_ENDPOINT — read from for music-bundle/
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

/**
 * Pick a music track for a given vibe + clip duration.
 *
 * Reads from the curated R2 music-bundle. Returns a presigned R2 GET URL
 * the assembling stage can fetch + mix. The bundle path scheme is:
 *   music-bundle/<vibe>/<idx>.mp3
 * where <vibe> ∈ {hype,calm,real,funny,sad} and <idx> ∈ {01..10} (10 per vibe).
 *
 * Returns null if R2 not configured or bundle not yet seeded.
 *
 * One-time setup: run `scripts/seed-music-bundle.ts` to populate R2 with
 * 50 royalty-free tracks tagged by Vibe.
 */
export async function pickMusicForVibe(opts: {
  vibe: Vibe;
  clip_duration_sec: number;
}): Promise<{ audio_url: string; track_id: string; volume_db: number; duration_sec: number } | null> {
  // Lazy-import R2 helpers so this lib still type-checks without R2 envs.
  const { isR2Configured, presignR2Url } = await import('@/lib/storage/r2');
  if (!isR2Configured()) {
    console.warn('[music-broll] R2 not configured — skipping music');
    return null;
  }

  const profile = VIBE_MUSIC[opts.vibe] || VIBE_MUSIC.real;
  // Pick a random track 01..10 from the vibe folder
  const idx = String(1 + Math.floor(Math.random() * 10)).padStart(2, '0');
  const vibeFolder = String(opts.vibe).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'real';
  const key = `music-bundle/${vibeFolder}/${idx}.mp3`;

  try {
    const audioUrl = presignR2Url({ method: 'GET', key, expiresInSec: 3600 });
    return {
      audio_url: audioUrl,
      track_id: key,
      volume_db: profile.volumeDb,
      duration_sec: opts.clip_duration_sec, // we loop or trim as needed during ffmpeg mix
    };
  } catch (err) {
    console.warn('[music-broll] R2 music presign failed:', err);
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

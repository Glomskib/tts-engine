// ============================================================
// B-roll Scout — Provider interfaces + Pexels stock provider
// ============================================================

export interface BrollRequest {
  keyword: string;
  description: string;
  recommendedFor: string; // e.g. "hook", "cta", "general"
  /** Optional minimum clip length in seconds. */
  minDurationSec?: number;
  /** Optional max clip length in seconds. */
  maxDurationSec?: number;
  /** Orientation hint — defaults to portrait for short-form. */
  orientation?: 'portrait' | 'landscape' | 'square';
}

export interface BrollResult {
  buffer: Buffer | null;
  url: string | null;
  sourceType: 'ai' | 'stock' | 'reference';
  prompt: string;
  durationSeconds: number | null;
  tags: string[];
}

/** Whether AI b-roll generation is available (stub until provider is configured). */
export const AI_BROLL_AVAILABLE = false;

/** Whether stock b-roll fetching is available — true when PEXELS_API_KEY is set. */
export const STOCK_BROLL_AVAILABLE = !!process.env.PEXELS_API_KEY;

// ---- AI Generator stub (e.g. Veo / Runway) ----
export async function generateAiBroll(_req: BrollRequest): Promise<BrollResult | null> {
  // STUB: Awaiting AI video provider integration (Runway / Veo)
  return null;
}

// ---- Pexels stock provider ----
// API docs: https://www.pexels.com/api/documentation/#videos-search
// Free tier: 200 requests/hr, 20K/month. Plenty for our scale.
//
// We pick the BEST candidate based on:
//   1. Duration falling in the requested range (default 3–15s)
//   2. Resolution close to 1080×1920 (or whatever the orientation prefers)
//   3. The first result if no candidate matches the range
//
// Returns null if no key configured, no results, or the network call fails.
// Failures are swallowed — render-plan falls back to the raw clip with no
// b-roll cutaway when this returns null.

interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  duration: number; // seconds
  width: number;
  height: number;
  url: string;
  user: { name: string; url: string };
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
  total_results?: number;
}

export async function fetchStockBroll(req: BrollRequest): Promise<BrollResult | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  const query = req.keyword?.trim() || req.description?.trim();
  if (!query) return null;

  const orientation = req.orientation ?? 'portrait';
  const minDur = req.minDurationSec ?? 3;
  const maxDur = req.maxDurationSec ?? 15;

  const url =
    `https://api.pexels.com/videos/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=10` +
    `&orientation=${orientation}`;

  let body: PexelsSearchResponse;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: apiKey },
      // Pexels rate-limits per key; short timeout so a slow response can't
      // block a render.
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      console.warn(`[broll/pexels] non-ok ${resp.status} for query="${query}"`);
      return null;
    }
    body = (await resp.json()) as PexelsSearchResponse;
  } catch (err) {
    console.warn(`[broll/pexels] fetch failed for query="${query}":`, err);
    return null;
  }

  const candidates = body.videos ?? [];
  if (candidates.length === 0) return null;

  // Score: prefer in-range duration, prefer ≥720p, prefer higher result rank.
  const scored = candidates.map((v, idx) => {
    let s = 100 - idx; // base rank
    if (v.duration >= minDur && v.duration <= maxDur) s += 50;
    if (v.duration < minDur) s -= 30;
    if (v.duration > maxDur * 2) s -= 20;
    const fitFile = pickBestFile(v.video_files, orientation);
    if (fitFile) {
      const minDim = Math.min(fitFile.width, fitFile.height);
      if (minDim >= 720) s += 10;
      if (minDim >= 1080) s += 10;
    } else {
      s -= 100;
    }
    return { video: v, score: s, file: fitFile };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || !best.file) return null;

  return {
    buffer: null,
    url: best.file.link,
    sourceType: 'stock',
    prompt: query,
    durationSeconds: best.video.duration,
    tags: [query, orientation, `pexels:${best.video.id}`],
  };
}

function pickBestFile(files: PexelsVideoFile[], orientation: 'portrait' | 'landscape' | 'square'): PexelsVideoFile | null {
  if (!files || files.length === 0) return null;
  // Filter to mp4 files only (Pexels also returns webm sometimes).
  const mp4s = files.filter(f => f.file_type === 'video/mp4');
  const pool = mp4s.length ? mp4s : files;

  // Prefer the right orientation.
  const portrait = (f: PexelsVideoFile) => f.height > f.width;
  const landscape = (f: PexelsVideoFile) => f.width > f.height;
  const square = (f: PexelsVideoFile) => Math.abs(f.width - f.height) < Math.min(f.width, f.height) * 0.1;

  let oriented = pool;
  if (orientation === 'portrait') oriented = pool.filter(portrait);
  else if (orientation === 'landscape') oriented = pool.filter(landscape);
  else if (orientation === 'square') oriented = pool.filter(square);
  if (oriented.length === 0) oriented = pool;

  // Pick the highest-res file that doesn't exceed 1920×1080-ish in long edge.
  oriented.sort((a, b) => {
    const aSize = Math.max(a.width, a.height);
    const bSize = Math.max(b.width, b.height);
    const aBucket = aSize <= 1920 ? aSize : -aSize; // prefer ≤1920 first, then sort largest first
    const bBucket = bSize <= 1920 ? bSize : -bSize;
    return bBucket - aBucket;
  });

  return oriented[0] ?? null;
}

// ---- Parse script notes into structured b-roll requests ----
export function parseBrollSuggestions(
  notes: string | null,
  brollSuggestions: string | null,
): BrollRequest[] {
  const requests: BrollRequest[] = [];
  const text = [notes, brollSuggestions].filter(Boolean).join('\n');
  if (!text.trim()) return requests;

  // Split on newlines, bullet points, or numbered items
  const lines = text
    .split(/[\n\r]+/)
    .map(l => l.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(l => l.length > 3);

  for (const line of lines) {
    // Try to extract a recommended-for hint from brackets like [hook] or [cta]
    const hintMatch = line.match(/\[([^\]]+)\]/);
    const hint = hintMatch ? hintMatch[1].toLowerCase() : 'general';
    const cleanLine = line.replace(/\[[^\]]+\]/, '').trim();

    // Extract keywords (first 3 significant words)
    const words = cleanLine.split(/\s+/).filter(w => w.length > 2).slice(0, 3);

    requests.push({
      keyword: words.join(' '),
      description: cleanLine,
      recommendedFor: hint,
    });
  }

  return requests;
}

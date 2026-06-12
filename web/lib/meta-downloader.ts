/**
 * Facebook + Instagram video downloader for the public transcriber.
 * Fallback-chain design mirrors lib/tiktok-downloader.ts.
 *
 * WHY this lives here instead of riding the Mac-mini yt-dlp ingest:
 * The ve_assets link-ingest path (scripts/render-node/slice-worker.mjs →
 * ingestLinks) is the right tool for logged-in /create jobs — it's async and
 * its rows require NOT NULL run_id/user_id FKs into ve_runs. The public
 * transcriber is anonymous and synchronous (Vercel maxDuration 60s), so it
 * can't create those rows or wait on the mini's poll loop. Instead we reuse
 * the existing serverless download machinery: the same self-hosted Cobalt
 * instance that already powers YouTube downloads (lib/youtube-transcript.ts)
 * supports facebook + instagram natively, with direct page-scrape fallbacks
 * for when Cobalt is unset or down.
 *
 * Support level (Brandon-approved 2026-06-11):
 * - Facebook public videos/reels: full support
 * - Instagram: best-effort BETA — Meta login-walls anonymous access often
 *   enough that callers must map failures to a friendly "upload it instead"
 *   message rather than a generic 500. See /api/transcribe error mapping.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type MetaPlatform = 'facebook' | 'instagram';

// ---------------------------------------------------------------------------
// URL validation — host whitelists only. Per-platform path parsing stays
// minimal on purpose: the downloaders (Cobalt / yt-dlp on the mini) own
// extraction, we just need to know "is this a Meta video link at all".
// ---------------------------------------------------------------------------

export function isValidFacebookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return [
      'www.facebook.com', 'facebook.com', 'm.facebook.com', 'web.facebook.com',
      'fb.watch', 'www.fb.watch',
      'fb.com', 'www.fb.com',
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function isValidInstagramUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return [
      'www.instagram.com', 'instagram.com', 'm.instagram.com',
      'instagr.am', 'www.instagr.am',
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function detectMetaPlatform(url: string): MetaPlatform | null {
  if (isValidFacebookUrl(url)) return 'facebook';
  if (isValidInstagramUrl(url)) return 'instagram';
  return null;
}

// ---------------------------------------------------------------------------
// Strategy 1: self-hosted Cobalt — supports facebook + instagram natively.
// Only attempted when COBALT_API_URL is set: the public api.cobalt.tools
// requires a Turnstile JWT a serverless function can't satisfy (same reason
// youtube-transcript.ts dropped it).
// ---------------------------------------------------------------------------

async function downloadViaCobalt(url: string): Promise<Buffer> {
  const cobaltUrl = process.env.COBALT_API_URL?.trim();
  if (!cobaltUrl) throw new Error('cobalt: COBALT_API_URL not configured');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': UA,
  };
  const cobaltApiKey = process.env.COBALT_API_KEY;
  if (cobaltApiKey) headers['Authorization'] = `Api-Key ${cobaltApiKey}`;

  const res = await fetch(cobaltUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url,
      // 720p keeps short-form payloads well inside the 60s route budget;
      // reels are rarely over a couple minutes anyway.
      videoQuality: '720',
      filenameStyle: 'basic',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`cobalt returned ${res.status}`);

  const data = await res.json();
  if (data.status === 'error') {
    throw new Error(`cobalt error: ${data.error?.code || 'unknown'}`);
  }

  // status: 'tunnel' | 'redirect' → url; 'picker' → pick the first video
  let videoUrl: string | null = data.url ?? null;
  if (!videoUrl && data.status === 'picker' && Array.isArray(data.picker)) {
    const pick = data.picker.find((p: { type?: string; url?: string }) => p.type === 'video') ?? data.picker[0];
    videoUrl = pick?.url ?? null;
  }
  if (!videoUrl) throw new Error('cobalt: no download URL in response');

  const videoRes = await fetch(videoUrl, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!videoRes.ok) throw new Error(`cobalt video download returned ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Strategy 2 (Facebook): page scrape. Public FB videos/reels inline their
// playable media URLs as JSON-escaped strings in the SSR payload. Field
// names have shifted over the years, so we try HD → SD → legacy keys.
// ---------------------------------------------------------------------------

async function downloadViaFacebookScrape(url: string): Promise<Buffer> {
  const pageRes = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow', // fb.watch short links 302 to the canonical video page
    signal: AbortSignal.timeout(10_000),
  });
  if (!pageRes.ok) throw new Error(`facebook page returned ${pageRes.status}`);
  const html = await pageRes.text();

  const match =
    html.match(/"browser_native_hd_url":"([^"]+)"/) ||
    html.match(/"browser_native_sd_url":"([^"]+)"/) ||
    html.match(/"playable_url_quality_hd":"([^"]+)"/) ||
    html.match(/"playable_url":"([^"]+)"/);

  if (!match) {
    throw new Error('facebook scrape: no playable URL in page (private, friends-only, or login-walled)');
  }

  // The URL is a JSON string literal (\/ and \uXXXX escapes) — let JSON.parse
  // unescape it rather than hand-rolling replacements.
  const videoUrl: string = JSON.parse(`"${match[1]}"`);

  const videoRes = await fetch(videoUrl, {
    headers: { 'User-Agent': UA, Referer: 'https://www.facebook.com/' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!videoRes.ok) throw new Error(`facebook video download returned ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Strategy 2 (Instagram): page scrape, best-effort. The /embed/captioned
// variant is less aggressively login-walled than the reel page itself, so
// try it first when we can pull a shortcode out of the path.
// ---------------------------------------------------------------------------

async function downloadViaInstagramScrape(url: string): Promise<Buffer> {
  const candidates: string[] = [];
  try {
    const parsed = new URL(url);
    const shortcode = parsed.pathname.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    if (shortcode) candidates.push(`https://www.instagram.com/p/${shortcode}/embed/captioned/`);
  } catch { /* fall through to the raw URL */ }
  candidates.push(url);

  const errors: string[] = [];

  for (const pageUrl of candidates) {
    try {
      const pageRes = await fetch(pageUrl, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (!pageRes.ok) {
        errors.push(`${pageUrl}: HTTP ${pageRes.status}`);
        continue;
      }
      const html = await pageRes.text();

      const match =
        html.match(/"video_url":"([^"]+)"/) ||
        html.match(/property="og:video"\s+content="([^"]+)"/) ||
        html.match(/content="([^"]+)"\s+property="og:video"/);
      if (!match) {
        errors.push(`${pageUrl}: no video URL in page`);
        continue;
      }

      // JSON-escaped in SSR data; HTML-entity-escaped in og: meta tags.
      const videoUrl: string = match[1].includes('\\')
        ? JSON.parse(`"${match[1]}"`)
        : match[1].replace(/&amp;/g, '&');

      const videoRes = await fetch(videoUrl, {
        headers: { 'User-Agent': UA, Referer: 'https://www.instagram.com/' },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      if (!videoRes.ok) {
        errors.push(`${pageUrl}: video download ${videoRes.status}`);
        continue;
      }
      const buffer = Buffer.from(await videoRes.arrayBuffer());
      if (buffer.length < 1000) {
        errors.push(`${pageUrl}: file too small`);
        continue;
      }
      return buffer;
    } catch (err) {
      errors.push(`${pageUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`instagram scrape: ${errors.join(' | ') || 'no candidates'}`);
}

// ---------------------------------------------------------------------------
// Main: fallback chain, same shape as downloadTikTokVideo()
// ---------------------------------------------------------------------------

interface Strategy {
  name: string;
  fn: (url: string) => Promise<Buffer>;
}

/**
 * Download a Facebook or Instagram video as a Buffer.
 * Throws "All download services failed (<platform>): ..." when every
 * strategy strikes out — /api/transcribe maps that to platform-specific
 * friendly copy (especially the Instagram beta message).
 */
export async function downloadMetaVideo(url: string): Promise<Buffer> {
  const platform = detectMetaPlatform(url);
  if (!platform) throw new Error('Not a Facebook or Instagram URL');

  const strategies: Strategy[] =
    platform === 'facebook'
      ? [
          { name: 'cobalt', fn: downloadViaCobalt },
          { name: 'fb-scrape', fn: downloadViaFacebookScrape },
        ]
      : [
          { name: 'cobalt', fn: downloadViaCobalt },
          { name: 'ig-scrape', fn: downloadViaInstagramScrape },
        ];

  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      console.log(`[meta-dl] Trying ${strategy.name} for ${platform}...`);
      const start = Date.now();
      const buffer = await strategy.fn(url);
      if (buffer.length < 1000) throw new Error('Downloaded file too small');
      console.log(
        `[meta-dl] ${strategy.name} succeeded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB in ${Date.now() - start}ms`
      );
      return buffer;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[meta-dl] ${strategy.name} failed: ${msg}`);
      errors.push(`${strategy.name}: ${msg}`);
    }
  }

  throw new Error(`All download services failed (${platform}): ${errors.join(' | ')}`);
}

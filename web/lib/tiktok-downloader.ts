/**
 * Resilient TikTok video downloader with multi-service fallback chain.
 * Tries services in order, tracks health, and prefers fastest healthy service.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Health tracking — in-memory per cold-start, log-only
// ---------------------------------------------------------------------------

interface ServiceHealth {
  successes: number;
  failures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  avgMs: number;
  consecutiveFailures: number;
}

const health: Record<string, ServiceHealth> = {};

function getHealth(name: string): ServiceHealth {
  if (!health[name]) {
    health[name] = {
      successes: 0,
      failures: 0,
      lastSuccess: null,
      lastFailure: null,
      avgMs: 0,
      consecutiveFailures: 0,
    };
  }
  return health[name];
}

function recordSuccess(name: string, durationMs: number) {
  const h = getHealth(name);
  h.successes++;
  h.lastSuccess = Date.now();
  h.consecutiveFailures = 0;
  h.avgMs = h.avgMs ? (h.avgMs * 0.7 + durationMs * 0.3) : durationMs;
}

function recordFailure(name: string) {
  const h = getHealth(name);
  h.failures++;
  h.lastFailure = Date.now();
  h.consecutiveFailures++;
}

/** A service is "down" if it failed 3+ times in a row in the last 5 minutes */
function isServiceDown(name: string): boolean {
  const h = getHealth(name);
  if (h.consecutiveFailures < 3) return false;
  if (!h.lastFailure) return false;
  return Date.now() - h.lastFailure < 5 * 60 * 1000;
}

/** Get service health summary for logging/debugging */
export function getServiceHealthSummary(): Record<string, ServiceHealth> {
  return { ...health };
}

// ---------------------------------------------------------------------------
// Strategy 1: tikwm.com — fast, reliable most of the time
// ---------------------------------------------------------------------------

async function downloadViaTikwm(tiktokUrl: string): Promise<Buffer> {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}&hd=0`;

  const metaRes = await fetch(apiUrl, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!metaRes.ok) throw new Error(`tikwm returned ${metaRes.status}`);

  const meta = await metaRes.json();
  if (meta.code !== 0 || !meta.data?.play) {
    throw new Error(meta.msg || 'tikwm: no video URL');
  }

  const videoRes = await fetch(meta.data.play, {
    headers: { 'User-Agent': UA, Referer: 'https://www.tikwm.com/' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!videoRes.ok) throw new Error(`tikwm video download returned ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Strategy 2: cobalt.tools — open-source, self-hostable
// ---------------------------------------------------------------------------

async function downloadViaCobalt(tiktokUrl: string): Promise<Buffer> {
  const cobaltUrl = process.env.COBALT_API_URL || 'https://api.cobalt.tools';

  const res = await fetch(cobaltUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({
      url: tiktokUrl,
      videoQuality: '720',
      filenameStyle: 'basic',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`cobalt returned ${res.status}`);

  const data = await res.json();

  // cobalt returns status: 'tunnel' | 'redirect' | 'picker' | 'error'
  if (data.status === 'error') {
    throw new Error(`cobalt error: ${data.error?.code || 'unknown'}`);
  }

  const videoUrl = data.url || data.audio;
  if (!videoUrl) {
    // Handle 'picker' — take first video option
    if (data.status === 'picker' && data.picker?.length) {
      const pick = data.picker.find((p: Record<string, unknown>) => p.type === 'video') || data.picker[0];
      if (pick?.url) {
        const videoRes = await fetch(pick.url, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(30_000),
        });
        if (!videoRes.ok) throw new Error(`cobalt picker download returned ${videoRes.status}`);
        return Buffer.from(await videoRes.arrayBuffer());
      }
    }
    throw new Error('cobalt: no download URL in response');
  }

  const videoRes = await fetch(videoUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30_000),
  });

  if (!videoRes.ok) throw new Error(`cobalt video download returned ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Strategy 3: TikTok page scraping — extract video from SSR data
// ---------------------------------------------------------------------------

async function downloadViaTikTokDirect(tiktokUrl: string): Promise<Buffer> {
  // Resolve short URLs (vm.tiktok.com, vt.tiktok.com) to full URLs
  let resolvedUrl = tiktokUrl;
  const parsed = new URL(tiktokUrl);
  if (['vm.tiktok.com', 'vt.tiktok.com'].includes(parsed.hostname)) {
    const headRes = await fetch(tiktokUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5_000),
    });
    resolvedUrl = headRes.url || tiktokUrl;
  }

  const pageRes = await fetch(resolvedUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!pageRes.ok) throw new Error(`TikTok page returned ${pageRes.status}`);
  const html = await pageRes.text();

  const dataMatch = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!dataMatch) throw new Error('No SSR data found in TikTok page');

  const universalData = JSON.parse(dataMatch[1]);
  const videoDetail =
    universalData?.__DEFAULT_SCOPE__?.['webapp.video-detail'];

  if (!videoDetail || videoDetail.statusCode !== 0) {
    throw new Error(`TikTok video detail status: ${videoDetail?.statusCode || 'missing'}`);
  }

  const video = videoDetail.itemInfo?.itemStruct?.video;
  if (!video) throw new Error('No video data in TikTok response');

  const videoUrl =
    video.downloadAddr ||
    video.playAddr ||
    video.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0] ||
    null;

  if (!videoUrl) throw new Error('No video download URL found');

  const videoRes = await fetch(videoUrl, {
    headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!videoRes.ok) throw new Error(`TikTok direct download returned ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Strategy 4: @tobyg74/tiktok-api-dl npm package
// ---------------------------------------------------------------------------

async function downloadViaNpmPackage(tiktokUrl: string): Promise<Buffer> {
  const { Downloader } = await import('@tobyg74/tiktok-api-dl');

  for (const version of ['v1', 'v3'] as const) {
    try {
      const result = await Downloader(tiktokUrl, { version });
      if (!result.result) continue;

      const r = result.result as Record<string, unknown>;
      const videoUrl =
        (r.video1 as string) ||
        (r.videoHD as string) ||
        (r.videoSD as string) ||
        (typeof r.video === 'string' ? r.video : null) ||
        (Array.isArray(r.video) ? (r.video[0] as string) : null);

      if (!videoUrl || typeof videoUrl !== 'string') continue;

      const videoRes = await fetch(videoUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30_000),
      });

      if (!videoRes.ok) continue;
      return Buffer.from(await videoRes.arrayBuffer());
    } catch {
      continue;
    }
  }

  throw new Error('npm package: all versions failed');
}

// ---------------------------------------------------------------------------
// Strategy 5: snaptik.app scraping
// ---------------------------------------------------------------------------

async function downloadViaSnaptik(tiktokUrl: string): Promise<Buffer> {
  // Step 1: Get the main page to extract the token
  const pageRes = await fetch('https://snaptik.app/en', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!pageRes.ok) throw new Error(`snaptik page returned ${pageRes.status}`);
  const html = await pageRes.text();

  // Extract token from form
  const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
  if (!tokenMatch) throw new Error('snaptik: could not find token');

  // Step 2: Submit the URL
  const formData = new URLSearchParams({
    url: tiktokUrl,
    token: tokenMatch[1],
  });

  const apiRes = await fetch('https://snaptik.app/abc2.php', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://snaptik.app/en',
    },
    body: formData.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!apiRes.ok) throw new Error(`snaptik API returned ${apiRes.status}`);
  const responseHtml = await apiRes.text();

  // Extract video download URL from the response
  const urlMatch = responseHtml.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i) ||
    responseHtml.match(/"(https?:\/\/[^"]+(?:snaptik|tiktok|cdn)[^"]*\.mp4[^"]*)"/i) ||
    responseHtml.match(/window\.location\.href\s*=\s*["'](https?:\/\/[^"']+)["']/);

  if (!urlMatch) throw new Error('snaptik: no video URL in response');

  const videoRes = await fetch(urlMatch[1], {
    headers: { 'User-Agent': UA, Referer: 'https://snaptik.app/' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!videoRes.ok) throw new Error(`snaptik video download returned ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Main: resilient fallback chain with health-aware ordering
// ---------------------------------------------------------------------------

interface Strategy {
  name: string;
  fn: (url: string) => Promise<Buffer>;
}

const ALL_STRATEGIES: Strategy[] = [
  { name: 'tikwm', fn: downloadViaTikwm },
  { name: 'cobalt', fn: downloadViaCobalt },
  { name: 'tiktok-direct', fn: downloadViaTikTokDirect },
  { name: 'npm-package', fn: downloadViaNpmPackage },
  { name: 'snaptik', fn: downloadViaSnaptik },
];

/**
 * Download a TikTok video using a resilient multi-service fallback chain.
 * - Skips services that are "down" (3+ consecutive failures in last 5 min)
 * - Tracks success/failure metrics per service
 * - Returns the video as a Buffer
 */
export async function downloadTikTokVideo(tiktokUrl: string): Promise<Buffer> {
  // Sort: healthy services first, then by average speed
  const strategies = [...ALL_STRATEGIES].sort((a, b) => {
    const aDown = isServiceDown(a.name) ? 1 : 0;
    const bDown = isServiceDown(b.name) ? 1 : 0;
    if (aDown !== bDown) return aDown - bDown;
    return (getHealth(a.name).avgMs || 9999) - (getHealth(b.name).avgMs || 9999);
  });

  const errors: string[] = [];

  for (const strategy of strategies) {
    if (isServiceDown(strategy.name)) {
      console.log(`[tiktok-dl] Skipping ${strategy.name} (marked down)`);
      errors.push(`${strategy.name}: skipped (down)`);
      continue;
    }

    try {
      console.log(`[tiktok-dl] Trying ${strategy.name}...`);
      const start = Date.now();
      const buffer = await strategy.fn(tiktokUrl);
      const elapsed = Date.now() - start;

      if (buffer.length < 1000) throw new Error('Downloaded file too small');

      recordSuccess(strategy.name, elapsed);
      console.log(
        `[tiktok-dl] ${strategy.name} succeeded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB in ${elapsed}ms`
      );
      return buffer;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordFailure(strategy.name);
      console.warn(`[tiktok-dl] ${strategy.name} failed: ${msg}`);
      errors.push(`${strategy.name}: ${msg}`);
    }
  }

  // Log health summary when all fail
  console.error('[tiktok-dl] All services failed. Health:', JSON.stringify(health, null, 2));

  throw new Error(`All download services failed: ${errors.join(' | ')}`);
}

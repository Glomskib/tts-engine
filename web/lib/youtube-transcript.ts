import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { getSubtitles } from 'youtube-caption-extractor';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ============================================================================
// Supadata transcript API (works from cloud/serverless IPs)
// ============================================================================

interface SupadataChunk {
  text: string;
  offset: number;   // milliseconds
  duration: number;  // milliseconds
  lang?: string;
}

interface SupadataResponse {
  content: SupadataChunk[] | string;
  lang?: string;
  availableLangs?: string[];
  // Async job fields
  jobId?: string;
  status?: 'completed' | 'queued' | 'active' | 'failed';
  error?: string;
}

async function fetchTranscriptViaSupadata(
  url: string,
  apiKey: string
): Promise<{ transcript: string; segments: Segment[]; language: string } | null> {
  const endpoint = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}&mode=auto`;

  const res = await fetch(endpoint, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 404) {
    console.warn('[supadata] Video not found or private');
    return null;
  }
  if (res.status === 403) {
    console.warn('[supadata] Access forbidden');
    return null;
  }
  if (res.status === 206) {
    console.warn('[supadata] Transcript unavailable for this video');
    return null;
  }

  // Async job — poll for completion
  if (res.status === 202) {
    const jobData: SupadataResponse = await res.json();
    if (!jobData.jobId) throw new Error('supadata: no jobId in 202 response');
    return await pollSupadataJob(jobData.jobId, apiKey);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`supadata returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: SupadataResponse = await res.json();
  return parseSupadataResponse(data);
}

async function pollSupadataJob(
  jobId: string,
  apiKey: string
): Promise<{ transcript: string; segments: Segment[]; language: string } | null> {
  const maxAttempts = 60; // 60 seconds max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));

    const res = await fetch(`https://api.supadata.ai/v1/transcript/${jobId}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) continue;
    const data: SupadataResponse = await res.json();

    if (data.status === 'failed') {
      throw new Error(`supadata job failed: ${data.error || 'unknown'}`);
    }
    if (data.status === 'completed') {
      return parseSupadataResponse(data);
    }
    // queued or active — keep polling
  }
  throw new Error('supadata: job timed out after 60s');
}

function parseSupadataResponse(
  data: SupadataResponse
): { transcript: string; segments: Segment[]; language: string } | null {
  const language = data.lang || 'en';

  // Plain text response
  if (typeof data.content === 'string') {
    if (!data.content.trim()) return null;
    return {
      transcript: data.content,
      segments: [{ start: 0, end: 0, text: data.content }],
      language,
    };
  }

  // Timestamped chunks
  if (!Array.isArray(data.content) || data.content.length === 0) return null;

  const segments: Segment[] = data.content
    .filter(c => c.text?.trim())
    .map(c => ({
      start: (c.offset || 0) / 1000,
      end: ((c.offset || 0) + (c.duration || 0)) / 1000,
      text: c.text.trim(),
    }));

  if (segments.length === 0) return null;

  const transcript = segments.map(s => s.text).join(' ');
  return { transcript, segments, language };
}

// ============================================================================
// URL validation
// ============================================================================

export function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const validHosts = [
      'www.youtube.com', 'youtube.com', 'm.youtube.com',
      'youtu.be', 'www.youtu.be',
    ];
    if (!validHosts.includes(parsed.hostname)) return false;

    // Reject playlists, channels, live streams
    if (parsed.pathname.startsWith('/playlist')) return false;
    if (parsed.pathname.startsWith('/channel') || parsed.pathname.startsWith('/c/') || parsed.pathname.startsWith('/@')) return false;
    if (parsed.pathname.startsWith('/live')) return false;
    if (parsed.searchParams.has('list') && !parsed.searchParams.has('v')) return false;

    // Must be a video: /watch?v=, /shorts/, or youtu.be/ID
    const isWatch = parsed.pathname === '/watch' && parsed.searchParams.has('v');
    const isShort = parsed.pathname.startsWith('/shorts/');
    const isShortUrl = parsed.hostname === 'youtu.be' || parsed.hostname === 'www.youtu.be';

    return isWatch || isShort || isShortUrl;
  } catch {
    return false;
  }
}

// ============================================================================
// Video ID extraction
// ============================================================================

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be' || parsed.hostname === 'www.youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/')[2] || null;
    }
    return parsed.searchParams.get('v') || null;
  } catch {
    return null;
  }
}

// ============================================================================
// VTT parsing
// ============================================================================

interface Segment {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  // Handles HH:MM:SS.mmm, MM:SS.mmm, and variants with comma decimal
  const normalized = ts.replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(normalized) || 0;
}

// Matches both HH:MM:SS.mmm and MM:SS.mmm timestamp pairs
const VTT_TIMESTAMP_RE = /^(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/;

export function parseVttToSegments(vttContent: string): Segment[] {
  const lines = vttContent.split('\n');
  const segments: Segment[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!VTT_TIMESTAMP_RE.test(line)) {
      i++;
      continue;
    }

    // Extract the two timestamps
    const tsParts = line.split('-->');
    const start = parseTimestamp(tsParts[0].trim());
    const end = parseTimestamp(tsParts[1].trim().split(/\s/)[0]); // strip position metadata after timestamp
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i].trim());
      i++;
    }

    const text = textLines
      .join(' ')
      .replace(/<[^>]+>/g, '') // strip HTML tags (<c>, <c.colorXXXXXX>, etc.)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (text) segments.push({ start, end, text });
  }

  // Deduplicate overlapping auto-caption cues
  // YouTube auto-captions repeat text with scrolling overlaps
  const deduped: Segment[] = [];
  for (const seg of segments) {
    if (deduped.length === 0) {
      deduped.push(seg);
      continue;
    }
    const prev = deduped[deduped.length - 1];
    // If this segment's text is contained in the previous, skip
    if (prev.text.includes(seg.text)) continue;
    // If previous text is a prefix of this one, replace with the longer version
    if (seg.text.startsWith(prev.text)) {
      prev.text = seg.text;
      prev.end = seg.end;
      continue;
    }
    // If there's overlap, try to extract only the new part
    if (seg.text !== prev.text) {
      // Check if the segment text starts with the tail of the previous
      const words = seg.text.split(/\s+/);
      const prevWords = prev.text.split(/\s+/);
      let overlapLen = 0;
      for (let k = 1; k <= Math.min(words.length, prevWords.length); k++) {
        const tail = prevWords.slice(-k).join(' ');
        const head = words.slice(0, k).join(' ');
        if (tail === head) overlapLen = k;
      }
      if (overlapLen > 0 && overlapLen < words.length) {
        const newText = words.slice(overlapLen).join(' ');
        if (newText.trim()) {
          deduped.push({ start: seg.start, end: seg.end, text: newText.trim() });
        }
      } else {
        deduped.push(seg);
      }
    }
  }

  return deduped;
}

// ============================================================================
// YouTube JSON3 caption parsing
// ============================================================================

function parseJson3ToSegments(json3: Record<string, unknown>): Segment[] {
  const events = (json3 as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> }).events;
  if (!Array.isArray(events)) return [];

  const segments: Segment[] = [];
  for (const event of events) {
    if (!event.segs) continue;
    const text = event.segs
      .map((s) => s.utf8 || '')
      .join('')
      .replace(/\n/g, ' ')
      .trim();
    if (!text) continue;

    const start = (event.tStartMs || 0) / 1000;
    const end = start + ((event.dDurationMs || 0) / 1000);
    segments.push({ start, end, text });
  }

  return segments;
}

// ============================================================================
// YouTube XML timedtext parsing (ANDROID client returns this format)
// ============================================================================

function parseTimedtextXmlToSegments(xml: string): Segment[] {
  const segments: Segment[] = [];
  // Match <p t="ms" d="ms">text</p> elements
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const rawText = match[3]
      .replace(/<[^>]+>/g, '')  // strip HTML tags
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n/g, ' ')
      .trim();
    if (rawText) {
      segments.push({
        start: startMs / 1000,
        end: (startMs + durMs) / 1000,
        text: rawText,
      });
    }
  }
  return segments;
}

// ============================================================================
// YouTube Innertube API — get player response (no yt-dlp needed)
// ============================================================================

interface PlayerResponse {
  videoDetails?: {
    lengthSeconds?: string;
    title?: string;
    videoId?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl: string;
        languageCode: string;
        kind?: string;
        name?: { simpleText?: string };
      }>;
    };
  };
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
}

// Brace-balanced JSON extraction — more reliable than greedy/lazy regex for nested objects
function extractFirstJsonObject(text: string, startIndex = 0): string | null {
  const start = text.indexOf('{', startIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

async function fetchPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  const errors: string[] = [];

  // Strategy 1: WEB client with consent cookie (doesn't need PO token for caption data)
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        'Cookie': 'CONSENT=PENDING+999',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241126.01.00',
            hl: 'en',
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      const status = data.playabilityStatus?.status;
      if (data.videoDetails && status === 'OK') return data as PlayerResponse;
      errors.push(`WEB: status=${status} reason=${data.playabilityStatus?.reason || 'none'}`);
    } else {
      errors.push(`WEB: HTTP ${res.status}`);
    }
  } catch (err) {
    errors.push(`WEB: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 2: ANDROID client (modern version)
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            androidSdkVersion: 34,
            hl: 'en',
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      const status = data.playabilityStatus?.status;
      if (data.videoDetails && status === 'OK') return data as PlayerResponse;
      errors.push(`ANDROID: status=${status} reason=${data.playabilityStatus?.reason || 'none'}`);
    } else {
      errors.push(`ANDROID: HTTP ${res.status}`);
    }
  } catch (err) {
    errors.push(`ANDROID: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 3: Scrape watch page — brace-balanced ytInitialPlayerResponse extraction
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
        'Cookie': 'CONSENT=PENDING+999',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      // Find assignment, then extract the JSON object using brace-balancing
      const assignIdx = html.search(/ytInitialPlayerResponse\s*=\s*\{/);
      if (assignIdx !== -1) {
        const braceStart = html.indexOf('{', assignIdx);
        const jsonStr = extractFirstJsonObject(html, braceStart);
        if (jsonStr) {
          try {
            const data = JSON.parse(jsonStr);
            if (data.playabilityStatus?.status === 'OK') return data as PlayerResponse;
            errors.push(`Scrape: status=${data.playabilityStatus?.status}`);
          } catch {
            errors.push(`Scrape: JSON parse failed (len=${jsonStr.length})`);
          }
        } else {
          errors.push('Scrape: brace extraction failed');
        }
      } else {
        const isConsent = html.includes('consent.youtube.com') || html.includes('CONSENT');
        errors.push(`Scrape: no player response found${isConsent ? ' (consent page)' : ''} html=${html.length}chars`);
      }
    } else {
      errors.push(`Scrape: HTTP ${pageRes.status}`);
    }
  } catch (err) {
    errors.push(`Scrape: ${err instanceof Error ? err.message : String(err)}`);
  }

  const errorSummary = errors.join(' | ');
  console.error('[youtube-transcript] All strategies failed:', errorSummary);
  throw new Error(`YouTube player response failed: ${errorSummary}`);
}

// ============================================================================
// Watch page scrape — standalone transcript extraction (no Innertube API)
// ============================================================================

async function scrapeTranscriptFromWatchPage(
  videoId: string
): Promise<CaptionResult | null> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
      'Cookie': 'CONSENT=PENDING+999',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const assignIdx = html.search(/ytInitialPlayerResponse\s*=\s*\{/);
  if (assignIdx === -1) return null;

  const braceStart = html.indexOf('{', assignIdx);
  const jsonStr = extractFirstJsonObject(html, braceStart);
  if (!jsonStr) return null;

  let player: PlayerResponse;
  try {
    player = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (player.playabilityStatus?.status !== 'OK') return null;

  const captionTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks || captionTracks.length === 0) return null;

  const manualEn = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
  const autoEn = captionTracks.find(t => t.languageCode === 'en');
  const track = manualEn || autoEn || captionTracks[0];
  if (!track?.baseUrl) return null;

  const language = track.languageCode || 'en';
  const duration = parseInt(player.videoDetails?.lengthSeconds || '0', 10);
  let segments: Segment[] = [];

  // Try JSON3 format first
  try {
    const sep = track.baseUrl.includes('?') ? '&' : '?';
    const json3Res = await fetch(track.baseUrl + sep + 'fmt=json3', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    if (json3Res.ok) {
      const content = await json3Res.text();
      try {
        segments = parseJson3ToSegments(JSON.parse(content));
      } catch {
        if (content.includes('<timedtext') || content.includes('<p t="')) {
          segments = parseTimedtextXmlToSegments(content);
        } else if (content.includes('WEBVTT')) {
          segments = parseVttToSegments(content);
        }
      }
    }
  } catch { /* fall through */ }

  // Fallback: raw fetch
  if (segments.length === 0) {
    try {
      const rawRes = await fetch(track.baseUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      if (rawRes.ok) {
        const content = await rawRes.text();
        if (content.includes('<timedtext') || content.includes('<p t="')) {
          segments = parseTimedtextXmlToSegments(content);
        } else if (content.includes('WEBVTT')) {
          segments = parseVttToSegments(content);
        } else {
          try { segments = parseJson3ToSegments(JSON.parse(content)); } catch { /* ignore */ }
        }
      }
    } catch { /* fall through */ }
  }

  if (segments.length === 0) return null;

  const transcript = segments.map(s => s.text).join(' ');
  if (!transcript.trim()) return null;

  return { transcript, segments, duration, language };
}

// ============================================================================
// Caption extraction — multi-strategy
// ============================================================================

interface CaptionResult {
  transcript: string;
  segments: Segment[];
  duration: number;
  language: string;
}

export async function extractYouTubeCaptions(url: string): Promise<CaptionResult | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const errors: string[] = [];

  // Strategy 0: Supadata API (works from cloud/serverless IPs)
  const supadataKey = process.env.SUPADATA_API_KEY;
  if (supadataKey) {
    try {
      console.log('[youtube-transcript] Trying Supadata API...');
      const result = await fetchTranscriptViaSupadata(url, supadataKey);
      if (result) {
        console.log('[youtube-transcript] Supadata succeeded:', result.transcript.length, 'chars');
        return { ...result, duration: 0 };
      }
      errors.push('Supadata: returned null (unavailable)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Supadata: ${msg}`);
      console.warn('[youtube-transcript] Supadata failed:', msg);
    }
  }

  // Strategy 1: youtube-caption-extractor npm package (page scraping, may work for some videos)
  try {
    console.log('[youtube-transcript] Trying youtube-caption-extractor package...');
    const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
    if (subtitles && subtitles.length > 0) {
      const segs: Segment[] = subtitles.map(s => ({
        start: parseFloat(String(s.start)) || 0,
        end: (parseFloat(String(s.start)) || 0) + (parseFloat(String(s.dur)) || 0),
        text: (s.text || '').replace(/\n/g, ' ').trim(),
      })).filter(s => s.text);

      if (segs.length > 0) {
        const transcript = segs.map(s => s.text).join(' ');
        const duration = Math.ceil(segs[segs.length - 1].end);
        console.log('[youtube-transcript] npm package succeeded:', transcript.length, 'chars');
        return { transcript, segments: segs, duration, language: 'en' };
      }
    }
    errors.push('npm-package: returned no subtitles');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`npm-package: ${msg}`);
    console.warn('[youtube-transcript] npm package failed:', msg);
  }

  // Strategy 2: Watch page scrape (standalone, no Innertube API call needed)
  try {
    console.log('[youtube-transcript] Trying watch page scrape...');
    const scrapeResult = await scrapeTranscriptFromWatchPage(videoId);
    if (scrapeResult) {
      console.log('[youtube-transcript] Watch page scrape succeeded:', scrapeResult.transcript.length, 'chars');
      return scrapeResult;
    }
    errors.push('watch-page-scrape: returned null');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`watch-page-scrape: ${msg}`);
    console.warn('[youtube-transcript] Watch page scrape failed:', msg);
  }

  // Strategy 3-5: Direct YouTube Innertube API (works locally, blocked from cloud IPs)
  try {
    const player = await fetchPlayerResponse(videoId);
    if (!player) {
      errors.push('Innertube: null response');
      throw new Error('Innertube: null response');
    }

    const status = player.playabilityStatus?.status;
    if (status && status !== 'OK') {
      errors.push(`Innertube: ${status} - ${player.playabilityStatus?.reason || 'no reason'}`);
      throw new Error(`Innertube: video ${status}`);
    }

    const duration = parseInt(player.videoDetails?.lengthSeconds || '0', 10);
    const captionTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      errors.push('Innertube: no caption tracks');
      throw new Error('Innertube: no caption tracks available');
    }

    const manualEn = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const autoEn = captionTracks.find(t => t.languageCode === 'en');
    const enTrack = manualEn || autoEn;
    const track = enTrack || captionTracks[0];

    if (!track?.baseUrl) {
      errors.push('Innertube: no caption URL');
      throw new Error('Innertube: no caption track URL');
    }

    const language = track.languageCode || 'en';

    // Fetch captions — prefer JSON3 (structured), fall back to raw/VTT
    let segments: Segment[] = [];

    // Attempt 1: Explicit JSON3 format (most reliable structured output)
    try {
      const json3Sep = track.baseUrl.includes('?') ? '&' : '?';
      const json3Url = track.baseUrl + json3Sep + 'fmt=json3';
      const json3Res = await fetch(json3Url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      if (json3Res.ok) {
        const content = await json3Res.text();
        try {
          const json3Data = JSON.parse(content);
          segments = parseJson3ToSegments(json3Data);
        } catch {
          // May have returned XML/VTT despite fmt=json3 — detect and parse
          if (content.includes('<timedtext') || content.includes('<p t="')) {
            segments = parseTimedtextXmlToSegments(content);
          } else if (content.includes('WEBVTT')) {
            segments = parseVttToSegments(content);
          }
        }
      }
    } catch (err) {
      console.warn('[youtube-transcript] JSON3 caption fetch failed:', err);
    }

    // Attempt 2: Raw fetch (no fmt param — detect format)
    if (segments.length === 0) {
      try {
        const captionRes = await fetch(track.baseUrl, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(10000),
        });
        if (captionRes.ok) {
          const content = await captionRes.text();
          if (content.includes('<timedtext') || content.includes('<p t="')) {
            segments = parseTimedtextXmlToSegments(content);
          } else if (content.includes('WEBVTT')) {
            segments = parseVttToSegments(content);
          } else {
            try {
              const json3Data = JSON.parse(content);
              segments = parseJson3ToSegments(json3Data);
            } catch {
              console.warn('[youtube-transcript] Unknown caption format, length:', content.length);
            }
          }
        }
      } catch (err) {
        console.warn('[youtube-transcript] Raw caption fetch failed:', err);
      }
    }

    // Attempt 3: Explicit VTT format as last resort
    if (segments.length === 0) {
      try {
        const vttSep = track.baseUrl.includes('?') ? '&' : '?';
        const vttUrl = track.baseUrl + vttSep + 'fmt=vtt';
        const vttRes = await fetch(vttUrl, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(10000),
        });
        if (vttRes.ok) {
          const vttContent = await vttRes.text();
          if (vttContent.includes('<timedtext') || vttContent.includes('<p t="')) {
            segments = parseTimedtextXmlToSegments(vttContent);
          } else {
            segments = parseVttToSegments(vttContent);
          }
        }
      } catch (err) {
        console.warn('[youtube-transcript] VTT fetch failed:', err);
      }
    }

    if (segments.length === 0) {
      errors.push('Innertube: got tracks but 0 segments from VTT/JSON3');
      throw new Error('Innertube: caption download yielded 0 segments');
    }

    const transcript = segments.map(s => s.text).join(' ');
    if (!transcript.trim()) {
      errors.push('Innertube: empty transcript text');
      throw new Error('Innertube: transcript text is empty');
    }

    return { transcript, segments, duration, language };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!errors.some(e => e.includes(msg))) {
      errors.push(`Innertube: ${msg}`);
    }
    console.warn('[youtube-transcript] All caption strategies failed:', errors.join(' | '));
    // Re-throw with full error context so the route handler can capture it
    throw new Error(`Caption extraction failed: ${errors.join(' | ')}`);
  }
}

// ============================================================================
// Audio download via cobalt.tools (replaces yt-dlp audio download)
// ============================================================================

export async function downloadYouTubeAudio(url: string): Promise<{ audioPath: string; duration: number }> {
  const videoId = extractVideoId(url);

  // Get duration from player response
  let duration = 0;
  if (videoId) {
    try {
      const player = await fetchPlayerResponse(videoId);
      duration = parseInt(player?.videoDetails?.lengthSeconds || '0', 10);
    } catch {
      // non-fatal — Whisper will provide duration
    }
  }

  const cobaltUrl = process.env.COBALT_API_URL || 'https://api.cobalt.tools';
  const cobaltApiKey = process.env.COBALT_API_KEY;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': UA,
  };

  // Public cobalt instance requires JWT auth; self-hosted may not
  if (cobaltApiKey) {
    headers['Authorization'] = `Api-Key ${cobaltApiKey}`;
  }

  const res = await fetch(cobaltUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      filenameStyle: 'basic',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`cobalt returned ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(`cobalt error: ${data.error?.code || JSON.stringify(data.error) || 'unknown'}`);
  }

  const audioUrl = data.url;
  if (!audioUrl) throw new Error('cobalt: no audio URL in response');

  const audioRes = await fetch(audioUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(120000),
  });

  if (!audioRes.ok) throw new Error(`Audio download returned ${audioRes.status}`);

  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  if (audioBuffer.length < 1000) throw new Error('Downloaded audio file too small');

  const audioPath = join(tmpdir(), `yt-audio-${randomUUID()}.mp3`);
  await writeFile(audioPath, audioBuffer);

  return { audioPath, duration };
}

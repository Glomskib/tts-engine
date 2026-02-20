import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

async function fetchPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
  const errors: string[] = [];

  // Strategy 1: ANDROID client (YouTube blocks unauthenticated WEB client requests)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.02.39 (Linux; U; Android 14) gzip',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.02.39',
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

  // Strategy 2: WEB client with consent cookie
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
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
            clientVersion: '2.20250101.00.00',
            hl: 'en',
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const status = data.playabilityStatus?.status;
      if (data.videoDetails && status === 'OK') return data as PlayerResponse;
      errors.push(`WEB: status=${status}`);
    } else {
      errors.push(`WEB: HTTP ${res.status}`);
    }
  } catch (err) {
    errors.push(`WEB: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 3: Scrape watch page with consent cookie
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
      // Try multiple patterns for extracting player response
      const match = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/) ||
        html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data.playabilityStatus?.status === 'OK') return data as PlayerResponse;
        errors.push(`Scrape: status=${data.playabilityStatus?.status}`);
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
// Caption extraction via YouTube API (replaces yt-dlp)
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

  try {
    const player = await fetchPlayerResponse(videoId);
    // fetchPlayerResponse throws if all strategies fail, so this shouldn't happen
    if (!player) return null;

    // Check playability
    const status = player.playabilityStatus?.status;
    if (status && status !== 'OK') {
      console.warn('[youtube-transcript] Video not playable:', status, player.playabilityStatus?.reason);
      return null;
    }

    const duration = parseInt(player.videoDetails?.lengthSeconds || '0', 10);
    const captionTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      console.log('[youtube-transcript] No caption tracks available');
      return null;
    }

    // Find best English caption track (prefer manual over auto-generated)
    const manualEn = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const autoEn = captionTracks.find(t => t.languageCode === 'en');
    const enTrack = manualEn || autoEn;
    // Fall back to first available track if no English
    const track = enTrack || captionTracks[0];

    if (!track?.baseUrl) {
      console.warn('[youtube-transcript] No caption track URL found');
      return null;
    }

    const language = track.languageCode || 'en';

    // Try VTT format first, then JSON3 as fallback
    let segments: Segment[] = [];

    // Attempt 1: VTT format
    try {
      const vttUrl = track.baseUrl + '&fmt=vtt';
      const vttRes = await fetch(vttUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      if (vttRes.ok) {
        const vttContent = await vttRes.text();
        segments = parseVttToSegments(vttContent);
      }
    } catch {
      // fall through to JSON3
    }

    // Attempt 2: JSON3 format (more reliable for some videos)
    if (segments.length === 0) {
      try {
        const json3Url = track.baseUrl + '&fmt=json3';
        const json3Res = await fetch(json3Url, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(10000),
        });
        if (json3Res.ok) {
          const json3Data = await json3Res.json();
          segments = parseJson3ToSegments(json3Data);
        }
      } catch {
        // both formats failed
      }
    }

    if (segments.length === 0) return null;

    const transcript = segments.map(s => s.text).join(' ');
    if (!transcript.trim()) return null;

    return { transcript, segments, duration, language };
  } catch (err) {
    console.warn('[youtube-transcript] Caption extraction failed:', err);
    return null;
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

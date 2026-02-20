/**
 * YouTube transcript extraction using yt-dlp.
 *
 * Uses youtube-dl-exec with a custom binary path:
 * - Local dev: system-installed yt-dlp (/opt/homebrew/bin/yt-dlp or /usr/local/bin/yt-dlp)
 * - Production (Vercel): standalone yt-dlp binary downloaded at build time to bin/yt-dlp
 */
import youtubedl from 'youtube-dl-exec';
import { readFile, unlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

export interface YouTubeTranscriptResult {
  transcript: string;
  segments: { start: number; end: number; text: string }[];
  videoId: string;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8: string }[];
}

const YOUTUBE_URL_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  /^([a-zA-Z0-9_-]{11})$/,
];

export function extractVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve the yt-dlp binary path.
 * Checks: bundled bin/ dir → common system paths → `which yt-dlp`
 */
function getYtDlpPath(): string {
  // 1. Bundled binary (for Vercel production)
  const bundled = join(process.cwd(), 'bin', 'yt-dlp');
  if (existsSync(bundled)) return bundled;

  // 2. Common system paths
  const systemPaths = [
    '/opt/homebrew/bin/yt-dlp',  // macOS Homebrew ARM
    '/usr/local/bin/yt-dlp',     // macOS Homebrew Intel / Linux
    '/usr/bin/yt-dlp',           // Linux system
  ];
  for (const p of systemPaths) {
    if (existsSync(p)) return p;
  }

  // 3. Fallback: which
  try {
    return execSync('which yt-dlp', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('yt-dlp binary not found. Install with: brew install yt-dlp');
  }
}

// Create a configured youtube-dl-exec instance with the resolved binary
const ytdlp = youtubedl.create(getYtDlpPath());

export async function fetchYouTubeTranscript(url: string): Promise<YouTubeTranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Could not extract video ID from URL');
  }

  const id = randomUUID();
  const outputTemplate = join(tmpdir(), `yt-caption-${id}`);
  const filesToClean: string[] = [];

  try {
    await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
      writeSub: true,
      writeAutoSub: true,
      subLang: 'en',
      subFormat: 'json3',
      skipDownload: true,
      noWarnings: true,
      output: outputTemplate,
    });

    // Find the generated subtitle file
    const candidates = [
      `${outputTemplate}.en.json3`,
      `${outputTemplate}.en-en.json3`,
    ];

    let subtitlePath: string | null = null;
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        subtitlePath = candidate;
        filesToClean.push(candidate);
        break;
      }
    }

    // Fallback: scan tmpdir for any file matching our prefix
    if (!subtitlePath) {
      const dir = tmpdir();
      const prefix = `yt-caption-${id}`;
      const files = await readdir(dir);
      for (const f of files) {
        if (f.startsWith(prefix) && f.endsWith('.json3')) {
          subtitlePath = join(dir, f);
          filesToClean.push(subtitlePath);
          break;
        }
      }
    }

    if (!subtitlePath) {
      throw new Error('No captions available for this video. The video may not have subtitles enabled.');
    }

    const raw = await readFile(subtitlePath, 'utf8');
    const data = JSON.parse(raw);

    const events: Json3Event[] = data.events || [];
    const segments = events
      .filter((e) => e.segs && e.segs.length > 0)
      .map((e) => {
        const startMs = e.tStartMs || 0;
        const durMs = e.dDurationMs || 0;
        const text = e.segs!
          .map((s) => s.utf8)
          .join('')
          .replace(/\n/g, ' ')
          .trim();
        return {
          start: startMs / 1000,
          end: (startMs + durMs) / 1000,
          text,
        };
      })
      .filter((s) => s.text);

    if (segments.length === 0) {
      throw new Error('No captions available for this video. The video may not have subtitles enabled.');
    }

    const transcript = segments.map((s) => s.text).join(' ');

    return { transcript, segments, videoId };
  } finally {
    for (const f of filesToClean) {
      try { await unlink(f); } catch { /* ignore */ }
    }
  }
}

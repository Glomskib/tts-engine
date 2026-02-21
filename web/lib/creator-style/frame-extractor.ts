/**
 * Extract evenly-spaced frames from a video buffer as base64 JPEG.
 *
 * Uses the same ffmpeg binary pattern as app/api/transcribe/route.ts.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedFrame {
  timestamp_seconds: number;
  base64_jpeg: string;
  size_bytes: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Extract `count` evenly-spaced frames from a video buffer.
 *
 * @param videoBuffer - Raw video file bytes (MP4)
 * @param durationSeconds - Video duration for calculating timestamps
 * @param count - Number of frames to extract (default 4)
 */
export async function extractFrames(
  videoBuffer: Buffer,
  durationSeconds: number,
  count: number = 4,
): Promise<ExtractedFrame[]> {
  if (durationSeconds <= 0 || count <= 0) return [];

  const id = randomUUID();
  const videoPath = join(tmpdir(), `style-frames-${id}.mp4`);
  const framePaths: string[] = [];

  try {
    await writeFile(videoPath, videoBuffer);

    // Calculate evenly-spaced timestamps
    // e.g. for 60s video with 4 frames: 12, 24, 36, 48
    const step = durationSeconds / (count + 1);
    const timestamps = Array.from(
      { length: count },
      (_, i) => Math.round(step * (i + 1) * 10) / 10,
    );

    const frames: ExtractedFrame[] = [];

    for (const ts of timestamps) {
      const framePath = join(tmpdir(), `style-frame-${id}-${ts}.jpg`);
      framePaths.push(framePath);

      try {
        await execFileAsync(ffmpegInstaller.path, [
          '-ss', String(ts),
          '-i', videoPath,
          '-frames:v', '1',
          '-q:v', '3',
          '-vf', 'scale=640:-1',
          '-y',
          framePath,
        ], { timeout: 10000 });

        if (existsSync(framePath)) {
          const frameData = await readFile(framePath);
          if (frameData.length > 500) {
            frames.push({
              timestamp_seconds: ts,
              base64_jpeg: frameData.toString('base64'),
              size_bytes: frameData.length,
            });
          }
        }
      } catch (err) {
        console.warn(`[frame-extractor] Failed to extract frame at ${ts}s:`, err);
      }
    }

    return frames;
  } finally {
    // Cleanup
    const allPaths = [videoPath, ...framePaths];
    for (const p of allPaths) {
      try {
        if (existsSync(p)) await unlink(p);
      } catch { /* ignore */ }
    }
  }
}

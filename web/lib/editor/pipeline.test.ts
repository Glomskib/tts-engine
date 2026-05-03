/**
 * Unit tests for the AI Video Editor pipeline's pure helpers.
 * The big multi-stage processEditJob() function isn't exercised here — that
 * needs ffmpeg + Whisper + Anthropic; covered by tests/smoke/editor-pipeline.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  humanizeEditJobError,
  dimsForPlatform,
  escapeAssPath,
  remapTranscriptToFinalTime,
} from './pipeline';

describe('humanizeEditJobError', () => {
  it('rewrites the OpenAI key error', () => {
    const out = humanizeEditJobError(new Error('OPENAI_API_KEY is not set'));
    expect(out).toMatch(/OPENAI_API_KEY/);
    expect(out).toMatch(/Retry/);
  });

  it('rewrites the 25 MB Whisper cap error', () => {
    const out = humanizeEditJobError(new Error('Maximum content size of 25MB exceeded'));
    expect(out).toMatch(/25 MB/);
  });

  it('rewrites Whisper rate-limit error', () => {
    const out = humanizeEditJobError(new Error('OpenAI 429 rate-limit exceeded'));
    expect(out).toMatch(/rate limit/i);
  });

  it('rewrites the no-raw-footage error', () => {
    const out = humanizeEditJobError(new Error('No raw footage attached'));
    expect(out).toMatch(/No raw footage|video on this job/);
  });

  it('rewrites Anthropic 5xx outages', () => {
    const out = humanizeEditJobError(new Error('Anthropic API error 503: gateway'));
    expect(out).toMatch(/Retry|moment/i);
  });

  it('rewrites ffmpeg failures', () => {
    const out = humanizeEditJobError(new Error('ffmpeg exited 1: bad codec'));
    expect(out).toMatch(/clip may be corrupted|standard \.mp4/);
  });

  it('falls back to the raw message for unrecognized errors', () => {
    const out = humanizeEditJobError(new Error('totally novel error xyz'));
    expect(out).toMatch(/totally novel error xyz/);
  });

  it('truncates very long unrecognized messages', () => {
    const long = 'x'.repeat(800);
    const out = humanizeEditJobError(new Error(long));
    expect(out.length).toBeLessThanOrEqual(401);
  });
});

describe('dimsForPlatform', () => {
  it('defaults to 9:16 for empty / unknown', () => {
    expect(dimsForPlatform(undefined)).toEqual({ width: 1080, height: 1920 });
    expect(dimsForPlatform('')).toEqual({ width: 1080, height: 1920 });
    expect(dimsForPlatform('madeup')).toEqual({ width: 1080, height: 1920 });
  });

  it('returns 9:16 for tiktok / reels / shorts', () => {
    expect(dimsForPlatform('tiktok')).toEqual({ width: 1080, height: 1920 });
    expect(dimsForPlatform('tiktok_shop')).toEqual({ width: 1080, height: 1920 });
    expect(dimsForPlatform('ig_reels')).toEqual({ width: 1080, height: 1920 });
    expect(dimsForPlatform('yt_shorts')).toEqual({ width: 1080, height: 1920 });
  });

  it('returns 16:9 for yt_long', () => {
    expect(dimsForPlatform('yt_long')).toEqual({ width: 1920, height: 1080 });
    expect(dimsForPlatform('youtube')).toEqual({ width: 1920, height: 1080 });
  });

  it('returns 1:1 for square', () => {
    expect(dimsForPlatform('square')).toEqual({ width: 1080, height: 1080 });
  });

  it('is case-insensitive', () => {
    expect(dimsForPlatform('YT_LONG')).toEqual({ width: 1920, height: 1080 });
  });
});

describe('escapeAssPath', () => {
  it('escapes colons (Windows drive letter style)', () => {
    expect(escapeAssPath('C:/tmp/captions.ass')).toBe('C\\:/tmp/captions.ass');
  });

  it('flips backslashes to forward', () => {
    expect(escapeAssPath('C:\\tmp\\captions.ass')).toBe('C\\:/tmp/captions.ass');
  });

  it('escapes apostrophes', () => {
    expect(escapeAssPath("/tmp/Brandon's edit/captions.ass"))
      .toBe("/tmp/Brandon\\'s edit/captions.ass");
  });

  it('leaves a clean unix path alone', () => {
    expect(escapeAssPath('/tmp/captions.ass')).toBe('/tmp/captions.ass');
  });
});

describe('remapTranscriptToFinalTime', () => {
  it('drops words and segments that fall in dropped ranges', () => {
    const out = remapTranscriptToFinalTime(
      {
        text: 'a b c',
        words: [
          { word: 'a', start: 1.0, end: 1.5 }, // in keep [0,3]
          { word: 'b', start: 4.0, end: 4.5 }, // dropped
          { word: 'c', start: 6.0, end: 6.5 }, // in keep [5,8]
        ],
        segments: [
          { start: 1.0, end: 1.5, text: 'a' },
          { start: 4.0, end: 4.5, text: 'b' },
          { start: 6.0, end: 6.5, text: 'c' },
        ],
      },
      [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    );
    expect(out.words).toHaveLength(2);
    expect(out.words[0]).toMatchObject({ word: 'a', start: 1.0, end: 1.5 });
    // Second range: cumulative offset = 3, so source 6.0 → final 4.0
    expect(out.words[1]).toMatchObject({ word: 'c', start: 4.0, end: 4.5 });

    expect(out.segments).toHaveLength(2);
    expect(out.segments[1]).toMatchObject({ start: 4.0, end: 4.5, text: 'c' });
  });

  it('passes through when keep ranges are empty', () => {
    const t = {
      text: 'x',
      words: [{ word: 'x', start: 1, end: 2 }],
      segments: [{ start: 1, end: 2, text: 'x' }],
    };
    expect(remapTranscriptToFinalTime(t, [])).toEqual(t);
  });
});

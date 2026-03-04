import { describe, it, expect } from 'vitest';
import { inferPlatform, isValidPostUrl } from './platform-inference';

describe('inferPlatform', () => {
  it('detects TikTok URLs', () => {
    expect(inferPlatform('https://www.tiktok.com/@user/video/1234567890')).toBe('tiktok');
    expect(inferPlatform('https://tiktok.com/@creator/video/1234')).toBe('tiktok');
    expect(inferPlatform('https://vm.tiktok.com/abc123')).toBe('tiktok');
  });

  it('detects Instagram URLs', () => {
    expect(inferPlatform('https://www.instagram.com/reel/ABC123/')).toBe('instagram');
    expect(inferPlatform('https://instagram.com/p/XYZ/')).toBe('instagram');
  });

  it('detects YouTube URLs', () => {
    expect(inferPlatform('https://www.youtube.com/watch?v=abc123')).toBe('youtube');
    expect(inferPlatform('https://youtu.be/abc123')).toBe('youtube');
    expect(inferPlatform('https://youtube.com/shorts/abc123')).toBe('youtube');
  });

  it('detects Facebook URLs', () => {
    expect(inferPlatform('https://www.facebook.com/watch/?v=123')).toBe('facebook');
    expect(inferPlatform('https://fb.watch/abc123/')).toBe('facebook');
  });

  it('returns other for unknown URLs', () => {
    expect(inferPlatform('https://twitter.com/user/status/123')).toBe('other');
    expect(inferPlatform('https://example.com/my-video')).toBe('other');
    expect(inferPlatform('not-a-url')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(inferPlatform('https://www.TikTok.com/@user/video/123')).toBe('tiktok');
    expect(inferPlatform('https://YOUTUBE.COM/watch?v=abc')).toBe('youtube');
  });
});

describe('isValidPostUrl', () => {
  it('accepts valid http URLs', () => {
    expect(isValidPostUrl('https://www.tiktok.com/@user/video/123')).toBe(true);
    expect(isValidPostUrl('http://example.com/video')).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(isValidPostUrl('not-a-url')).toBe(false);
    expect(isValidPostUrl('')).toBe(false);
    expect(isValidPostUrl('ftp://files.example.com/video.mp4')).toBe(false);
  });

  it('rejects non-http protocols', () => {
    expect(isValidPostUrl('javascript:alert(1)')).toBe(false);
    expect(isValidPostUrl('file:///etc/passwd')).toBe(false);
  });
});

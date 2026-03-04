/**
 * Infer social media platform from a post URL.
 */

import type { PostPlatform } from './types';

const PLATFORM_PATTERNS: Array<{ platform: PostPlatform; pattern: RegExp }> = [
  { platform: 'tiktok', pattern: /tiktok\.com/i },
  { platform: 'instagram', pattern: /instagram\.com/i },
  { platform: 'youtube', pattern: /youtube\.com|youtu\.be/i },
  { platform: 'facebook', pattern: /facebook\.com|fb\.watch/i },
];

/**
 * Infer the platform from a URL. Returns 'other' if no match.
 */
export function inferPlatform(url: string): PostPlatform {
  for (const { platform, pattern } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return 'other';
}

/**
 * Basic URL validation — must start with http(s).
 */
export function isValidPostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

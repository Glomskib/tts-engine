/**
 * Clip Index — Environment sanity checks
 */
export function requireYouTubeApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('[clip-index] YOUTUBE_API_KEY is not set');
  return key;
}

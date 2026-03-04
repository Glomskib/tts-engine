import type { MetricsProvider } from './types';
import { tiktokProvider } from './tiktok';
import { instagramProvider } from './instagram';
import { youtubeProvider } from './youtube';

const providers: Record<string, MetricsProvider> = {
  tiktok: tiktokProvider,
  instagram: instagramProvider,
  youtube: youtubeProvider,
};

export function getProvider(platform: string): MetricsProvider {
  return providers[platform] || providers.tiktok;
}

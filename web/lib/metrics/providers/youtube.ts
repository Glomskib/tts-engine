import type { MetricsProvider, MetricsProviderSnapshot } from './types';
import { ProviderNotConfiguredError } from './types';

export const youtubeProvider: MetricsProvider = {
  platform: 'youtube',
  async fetchLatest(_postUrl: string, _platformPostId?: string | null): Promise<MetricsProviderSnapshot> {
    throw new ProviderNotConfiguredError('youtube');
  },
};

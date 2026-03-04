import type { MetricsProvider, MetricsProviderSnapshot } from './types';
import { ProviderNotConfiguredError } from './types';

export const tiktokProvider: MetricsProvider = {
  platform: 'tiktok',
  async fetchLatest(_postUrl: string, _platformPostId?: string | null): Promise<MetricsProviderSnapshot> {
    throw new ProviderNotConfiguredError('tiktok');
  },
};

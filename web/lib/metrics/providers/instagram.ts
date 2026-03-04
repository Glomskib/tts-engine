import type { MetricsProvider, MetricsProviderSnapshot } from './types';
import { ProviderNotConfiguredError } from './types';

export const instagramProvider: MetricsProvider = {
  platform: 'instagram',
  async fetchLatest(_postUrl: string, _platformPostId?: string | null): Promise<MetricsProviderSnapshot> {
    throw new ProviderNotConfiguredError('instagram');
  },
};

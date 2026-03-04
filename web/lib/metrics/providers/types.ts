/**
 * Metrics Provider Interface
 *
 * Platform-specific metrics sync with stub providers.
 */

export interface MetricsProviderSnapshot {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  avg_watch_time_seconds?: number;
  completion_rate?: number;
  raw_json?: Record<string, unknown>;
}

export interface MetricsProvider {
  platform: string;
  fetchLatest(postUrl: string, platformPostId?: string | null): Promise<MetricsProviderSnapshot>;
}

export class ProviderNotConfiguredError extends Error {
  code = 'PROVIDER_NOT_CONFIGURED' as const;
  constructor(platform: string) {
    super(`${platform} metrics provider is not configured`);
    this.name = 'ProviderNotConfiguredError';
  }
}

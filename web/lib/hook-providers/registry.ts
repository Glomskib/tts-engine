/**
 * Hook provider registry — single source of truth for which providers exist.
 *
 * The Hook Generator UI calls listProviders() to render the picker. The
 * /api/hooks/generate endpoint calls getProvider(id) to resolve which
 * implementation to call.
 */
import type { HookProvider } from './types';
import { heygenProvider } from './heygen';
import { soraProvider } from './sora';
import { pikaProvider } from './pika';
import { runwayProvider } from './runway';
import { lumaProvider } from './luma';

const PROVIDERS: HookProvider[] = [
  heygenProvider,
  pikaProvider,
  lumaProvider,
  runwayProvider,
  soraProvider,
];

export function listProviders(): HookProvider[] {
  return PROVIDERS;
}

export function getProvider(id: string): HookProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Whether the provider's API key is configured. Used by the UI to grey out
 * picker options + show the "coming soon" badge for unconfigured providers.
 */
export function isProviderConfigured(id: HookProvider['id']): boolean {
  switch (id) {
    case 'heygen': return !!process.env.HEYGEN_API_KEY;
    case 'sora': return !!process.env.SORA_API_KEY;
    case 'pika': return !!process.env.PIKA_API_KEY;
    case 'runway': return !!process.env.RUNWAY_API_KEY;
    case 'luma': return !!process.env.LUMA_API_KEY;
    default: return false;
  }
}

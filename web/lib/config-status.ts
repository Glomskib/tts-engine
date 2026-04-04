/**
 * System Config Status
 * ====================
 * Reports which integrations are configured vs missing.
 * Powers the admin diagnostics page and health checks.
 *
 * NEVER exposes secret values — only presence booleans.
 */

import { checkFeatureConfig, ENV_REGISTRY, type FeatureGuardResult } from './env-validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  name: string;
  configured: boolean;
  missing: string[];
  message: string;
}

export interface SystemConfigStatus {
  overall_ok: boolean;
  boot_ok: boolean;
  integrations: IntegrationStatus[];
  summary: {
    configured: number;
    total: number;
    boot_missing: string[];
  };
}

// ---------------------------------------------------------------------------
// All tracked integration systems
// ---------------------------------------------------------------------------

const INTEGRATION_SYSTEMS = [
  'Supabase',
  'App',
  'Auth',
  'AI',
  'Cron',
  'Stripe',
  'TikTok',
  'TikTok Content',
  'TikTok Shop',
  'TikTok Research',
  'Google Drive',
  'HeyGen',
  'Shotstack',
  'Runway',
  'OpenClaw',
  'Telegram',
  'Email',
  'Sentry',
  'Late.dev',
  'Discord',
  'Scraping',
  'YouTube',
  'Mission Control',
  'Slack',
  'Outlook',
  'Browser Service',
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Get comprehensive system config status.
 * Call from admin diagnostics or health check endpoints.
 */
export function getSystemConfigStatus(): SystemConfigStatus {
  const integrations: IntegrationStatus[] = [];
  let configuredCount = 0;

  for (const system of INTEGRATION_SYSTEMS) {
    const result = checkFeatureConfig(system);
    integrations.push({
      name: system,
      configured: result.configured,
      missing: result.missing,
      message: result.message,
    });
    if (result.configured) configuredCount++;
  }

  // Check boot-critical vars specifically
  const bootVars = ENV_REGISTRY.filter(v => v.classification === 'REQUIRED_AT_BOOT');
  const bootMissing = bootVars
    .filter(v => {
      const val = process.env[v.key];
      return !(typeof val === 'string' && val.trim().length > 0);
    })
    .map(v => v.key);

  return {
    overall_ok: bootMissing.length === 0,
    boot_ok: bootMissing.length === 0,
    integrations,
    summary: {
      configured: configuredCount,
      total: INTEGRATION_SYSTEMS.length,
      boot_missing: bootMissing,
    },
  };
}

/**
 * Quick check: is a specific integration configured?
 * Use for runtime feature gating.
 *
 * Example:
 *   if (!isIntegrationConfigured('HeyGen')) {
 *     return { error: 'HeyGen integration not configured' };
 *   }
 */
export function isIntegrationConfigured(system: string): boolean {
  return checkFeatureConfig(system).configured;
}

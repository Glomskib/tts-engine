/**
 * Tests: Environment Variable Validation
 *
 * Verifies:
 *   - ENV_REGISTRY contains all boot-required vars
 *   - validateBootEnvVars detects missing vars
 *   - checkFeatureConfig correctly reports configured/unconfigured systems
 *   - requireFeature returns descriptive messages
 *   - NEXT_PUBLIC_ vars are marked clientSafe
 *   - Secret vars are marked secret
 *
 * Run: pnpm vitest run lib/security/env-validation.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ENV_REGISTRY,
  validateBootEnvVars,
  checkFeatureConfig,
  requireFeature,
  getEnvReport,
} from '@/lib/env-validation';

// ─── Registry Integrity ─────────────────────────────────────────────────────

describe('ENV_REGISTRY', () => {
  it('contains Supabase boot vars', () => {
    const keys = ENV_REGISTRY.map(v => v.key);
    expect(keys).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(keys).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(keys).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('contains ANTHROPIC_API_KEY as REQUIRED_AT_BOOT', () => {
    const entry = ENV_REGISTRY.find(v => v.key === 'ANTHROPIC_API_KEY');
    expect(entry).toBeDefined();
    expect(entry!.classification).toBe('REQUIRED_AT_BOOT');
  });

  it('contains CRON_SECRET as REQUIRED_AT_BOOT', () => {
    const entry = ENV_REGISTRY.find(v => v.key === 'CRON_SECRET');
    expect(entry).toBeDefined();
    expect(entry!.classification).toBe('REQUIRED_AT_BOOT');
  });

  it('marks NEXT_PUBLIC_ vars as clientSafe', () => {
    const publicVars = ENV_REGISTRY.filter(v => v.key.startsWith('NEXT_PUBLIC_'));
    for (const v of publicVars) {
      expect(v.clientSafe).toBe(true);
    }
  });

  it('marks API keys/secrets as secret', () => {
    const secretKeys = ENV_REGISTRY.filter(v =>
      v.key.includes('SECRET') || v.key.includes('_KEY') || v.key.includes('TOKEN')
    );
    // All vars with SECRET/KEY/TOKEN in the name should be marked secret
    // (excluding NEXT_PUBLIC_ vars which are intentionally client-safe)
    const serverSecrets = secretKeys.filter(v => !v.key.startsWith('NEXT_PUBLIC_'));
    for (const v of serverSecrets) {
      expect(v.secret).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = ENV_REGISTRY.map(v => v.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('every entry has a system and description', () => {
    for (const v of ENV_REGISTRY) {
      expect(v.system).toBeTruthy();
      expect(v.description).toBeTruthy();
    }
  });
});

// ─── Boot Validation ────────────────────────────────────────────────────────

describe('validateBootEnvVars', () => {
  const originalEnv: Record<string, string | undefined> = {};
  const bootKeys = ENV_REGISTRY
    .filter(v => v.classification === 'REQUIRED_AT_BOOT')
    .map(v => v.key);

  beforeEach(() => {
    // Save original values
    for (const key of bootKeys) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of bootKeys) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('reports ok when all boot vars are set', () => {
    for (const key of bootKeys) {
      process.env[key] = 'test-value';
    }
    const result = validateBootEnvVars();
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('reports missing vars when boot vars are unset', () => {
    for (const key of bootKeys) {
      delete process.env[key];
    }
    const result = validateBootEnvVars();
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBe(bootKeys.length);
  });
});

// ─── Feature Config ─────────────────────────────────────────────────────────

describe('checkFeatureConfig', () => {
  it('returns configured: false with descriptive message for unconfigured system', () => {
    // Runway only needs RUNWAY_API_KEY
    const saved = process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAY_API_KEY;

    const result = checkFeatureConfig('Runway');
    expect(result.configured).toBe(false);
    expect(result.missing).toContain('RUNWAY_API_KEY');
    expect(result.message).toContain('Runway');
    expect(result.message).toContain('disabled');

    if (saved) process.env.RUNWAY_API_KEY = saved;
  });

  it('returns configured: true when all feature vars are set', () => {
    const saved = process.env.RUNWAY_API_KEY;
    process.env.RUNWAY_API_KEY = 'test-key';

    const result = checkFeatureConfig('Runway');
    expect(result.configured).toBe(true);
    expect(result.missing).toHaveLength(0);

    if (saved) process.env.RUNWAY_API_KEY = saved;
    else delete process.env.RUNWAY_API_KEY;
  });
});

describe('requireFeature', () => {
  it('is an alias for checkFeatureConfig', () => {
    const a = checkFeatureConfig('HeyGen');
    const b = requireFeature('HeyGen');
    expect(a.configured).toBe(b.configured);
    expect(a.missing).toEqual(b.missing);
  });
});

// ─── Full Report ────────────────────────────────────────────────────────────

describe('getEnvReport', () => {
  it('returns a report with checks for all registry entries', () => {
    const report = getEnvReport();
    expect(report.checks.length).toBe(ENV_REGISTRY.length);
    expect(report.summary.required_total).toBeGreaterThan(0);
  });

  it('summary counts match check list', () => {
    const report = getEnvReport();
    const requiredChecks = report.checks.filter(c => c.required);
    const optionalChecks = report.checks.filter(c => !c.required);
    expect(report.summary.required_total).toBe(requiredChecks.length);
    expect(report.summary.optional_total).toBe(optionalChecks.length);
  });
});

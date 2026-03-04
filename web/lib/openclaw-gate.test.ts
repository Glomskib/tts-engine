import { describe, it, expect, beforeEach } from 'vitest';
import {
  isOpenClawEnabled,
  isFeatureRequired,
  assertFeature,
  FEATURE_REGISTRY,
} from './openclaw-gate';

describe('openclaw-gate', () => {
  beforeEach(() => {
    delete process.env.OPENCLAW_ENABLED;
    delete process.env.OPENCLAW_REQUIRED_FEATURES;
  });

  // -----------------------------------------------------------------------
  // isOpenClawEnabled
  // -----------------------------------------------------------------------

  describe('isOpenClawEnabled', () => {
    it('defaults to true when env not set', () => {
      expect(isOpenClawEnabled()).toBe(true);
    });

    it('returns true for "true"', () => {
      process.env.OPENCLAW_ENABLED = 'true';
      expect(isOpenClawEnabled()).toBe(true);
    });

    it('returns true for "1"', () => {
      process.env.OPENCLAW_ENABLED = '1';
      expect(isOpenClawEnabled()).toBe(true);
    });

    it('returns false for "false"', () => {
      process.env.OPENCLAW_ENABLED = 'false';
      expect(isOpenClawEnabled()).toBe(false);
    });

    it('returns false for "0"', () => {
      process.env.OPENCLAW_ENABLED = '0';
      expect(isOpenClawEnabled()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isFeatureRequired
  // -----------------------------------------------------------------------

  describe('isFeatureRequired', () => {
    it('returns false when OPENCLAW_REQUIRED_FEATURES is not set', () => {
      expect(isFeatureRequired('second_brain')).toBe(false);
    });

    it('returns true for listed feature', () => {
      process.env.OPENCLAW_REQUIRED_FEATURES = 'second_brain,hook_bank_import';
      expect(isFeatureRequired('second_brain')).toBe(true);
      expect(isFeatureRequired('hook_bank_import')).toBe(true);
    });

    it('returns false for unlisted feature', () => {
      process.env.OPENCLAW_REQUIRED_FEATURES = 'second_brain';
      expect(isFeatureRequired('hook_bank_import')).toBe(false);
    });

    it('handles spaces and empty entries', () => {
      process.env.OPENCLAW_REQUIRED_FEATURES = ' second_brain , , hook_bank_import ';
      expect(isFeatureRequired('second_brain')).toBe(true);
      expect(isFeatureRequired('hook_bank_import')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // assertFeature
  // -----------------------------------------------------------------------

  describe('assertFeature', () => {
    it('returns ok:true when OpenClaw is enabled', () => {
      // Default: enabled
      const result = assertFeature('second_brain');
      expect(result.ok).toBe(true);
    });

    it('returns ok:true when enabled even if feature is required', () => {
      process.env.OPENCLAW_REQUIRED_FEATURES = 'second_brain';
      const result = assertFeature('second_brain');
      expect(result.ok).toBe(true);
    });

    it('returns ok:false with status 503 for required+disabled', () => {
      process.env.OPENCLAW_ENABLED = 'false';
      process.env.OPENCLAW_REQUIRED_FEATURES = 'second_brain';

      const result = assertFeature('second_brain');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(503);
        expect(result.code).toBe('OPENCLAW_DISABLED');
        expect(result.message).toContain('required');
      }
    });

    it('returns ok:false without status for optional+disabled (graceful)', () => {
      process.env.OPENCLAW_ENABLED = 'false';
      // No OPENCLAW_REQUIRED_FEATURES set → all optional

      const result = assertFeature('second_brain');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBeUndefined();
        expect(result.code).toBe('OPENCLAW_DISABLED');
        expect(result.message).toContain('optional');
      }
    });

    it('disabled + empty required = all features are optional (non-fatal)', () => {
      process.env.OPENCLAW_ENABLED = 'false';
      process.env.OPENCLAW_REQUIRED_FEATURES = '';

      for (const f of FEATURE_REGISTRY) {
        const result = assertFeature(f.key);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBeUndefined();
        }
      }
    });

    it('disabled + only some features required = others stay optional', () => {
      process.env.OPENCLAW_ENABLED = 'false';
      process.env.OPENCLAW_REQUIRED_FEATURES = 'second_brain';

      const sbResult = assertFeature('second_brain');
      expect(sbResult.ok).toBe(false);
      if (!sbResult.ok) expect(sbResult.status).toBe(503);

      const hbResult = assertFeature('hook_bank_import');
      expect(hbResult.ok).toBe(false);
      if (!hbResult.ok) expect(hbResult.status).toBeUndefined();
    });

    it('external_research returns ok:true when enabled', () => {
      const result = assertFeature('external_research');
      expect(result.ok).toBe(true);
    });

    it('external_research returns ok:false (graceful) when disabled + optional', () => {
      process.env.OPENCLAW_ENABLED = 'false';

      const result = assertFeature('external_research');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBeUndefined();
        expect(result.code).toBe('OPENCLAW_DISABLED');
      }
    });

    it('external_research returns 503 when disabled + required', () => {
      process.env.OPENCLAW_ENABLED = 'false';
      process.env.OPENCLAW_REQUIRED_FEATURES = 'external_research';

      const result = assertFeature('external_research');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(503);
        expect(result.code).toBe('OPENCLAW_DISABLED');
        expect(result.message).toContain('external_research');
      }
    });
  });

  // -----------------------------------------------------------------------
  // FEATURE_REGISTRY
  // -----------------------------------------------------------------------

  describe('FEATURE_REGISTRY', () => {
    it('contains expected feature keys', () => {
      const keys = FEATURE_REGISTRY.map((f) => f.key);
      expect(keys).toContain('finops_openclaw_usage');
      expect(keys).toContain('second_brain');
      expect(keys).toContain('mc_pipeline_health_proxy');
      expect(keys).toContain('hook_bank_import');
      expect(keys).toContain('external_research');
    });

    it('every entry has key, description, and route', () => {
      for (const f of FEATURE_REGISTRY) {
        expect(f.key).toBeTruthy();
        expect(f.description).toBeTruthy();
        expect(f.route).toBeTruthy();
      }
    });
  });
});

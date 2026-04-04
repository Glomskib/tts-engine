/**
 * OpenClaw feature gate.
 *
 * Controls whether OpenClaw-dependent features (MC client, second-brain,
 * openclaw-adapter, agent orchestration) are active.
 *
 * Master switch: OPENCLAW_ENABLED (default: true).
 * Scoped requirements: OPENCLAW_REQUIRED_FEATURES (comma-separated feature keys).
 *
 * When OpenClaw is disabled:
 *   - Required features → hard fail (503)
 *   - Optional features → graceful degradation (200 with ok:false)
 */

const _logged = new Set<string>();

// ---------------------------------------------------------------------------
// Feature registry
// ---------------------------------------------------------------------------

export interface FeatureInfo {
  key: string;
  description: string;
  /** Route or module that uses this feature */
  route: string;
}

/** All known OpenClaw feature keys. */
export const FEATURE_REGISTRY: FeatureInfo[] = [
  { key: 'finops_openclaw_usage', description: 'FinOps OpenClaw usage ingestion', route: '/api/finops/openclaw/usage' },
  { key: 'second_brain', description: 'Second Brain document store', route: '/api/second-brain/*' },
  { key: 'mc_pipeline_health_proxy', description: 'Mission Control pipeline health proxy', route: '/api/admin/command-center/pipeline-health' },
  { key: 'hook_bank_import', description: 'Hook Bank import from MC', route: '/api/admin/hook-bank/import' },
  { key: 'external_research', description: 'External web data retrieval (TikTok, YouTube, URL scraping)', route: '/api/transcribe, /api/spy-report, /api/youtube-transcribe, /api/tiktok/oembed, /api/winners/*, /api/competitors/*/track-video, /api/products/*, /api/broll/import, /api/creator-style/ingest' },
  { key: 'creator_scan', description: 'Creator product/showcase scanning via OpenClaw', route: '/api/cron/radar-scan, /api/webhooks/openclaw/scan-result' },
];

// ---------------------------------------------------------------------------
// Master switch
// ---------------------------------------------------------------------------

/**
 * Returns true if OpenClaw features are enabled.
 * Default: true (preserves existing behavior).
 */
export function isOpenClawEnabled(): boolean {
  const flag = process.env.OPENCLAW_ENABLED;
  if (!flag) return true;
  return flag === 'true' || flag === '1';
}

// ---------------------------------------------------------------------------
// Scoped feature gates
// ---------------------------------------------------------------------------

/** Parse OPENCLAW_REQUIRED_FEATURES env var into a Set of feature keys. */
function getRequiredFeatures(): Set<string> {
  const raw = process.env.OPENCLAW_REQUIRED_FEATURES;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Returns true if `featureKey` is listed in OPENCLAW_REQUIRED_FEATURES.
 * A required feature returns 503 when OpenClaw is disabled.
 * An optional (unlisted) feature degrades gracefully.
 */
export function isFeatureRequired(featureKey: string): boolean {
  return getRequiredFeatures().has(featureKey);
}

export interface AssertFeatureOk {
  ok: true;
}

export interface AssertFeatureFail {
  ok: false;
  /** 503 = required + disabled (hard fail), undefined = optional + disabled (graceful) */
  status?: 503;
  code: string;
  message: string;
}

export type AssertFeatureResult = AssertFeatureOk | AssertFeatureFail;

/**
 * Check whether a gated feature should proceed.
 *
 * - OpenClaw enabled → `{ ok: true }` (always)
 * - OpenClaw disabled + feature required → `{ ok: false, status: 503 }` (hard fail)
 * - OpenClaw disabled + feature optional → `{ ok: false }` (graceful degradation)
 */
export function assertFeature(featureKey: string): AssertFeatureResult {
  if (isOpenClawEnabled()) {
    return { ok: true };
  }

  const required = isFeatureRequired(featureKey);

  if (required) {
    return {
      ok: false,
      status: 503,
      code: 'OPENCLAW_DISABLED',
      message: `OpenClaw is disabled and '${featureKey}' is a required feature`,
    };
  }

  return {
    ok: false,
    code: 'OPENCLAW_DISABLED',
    message: `OpenClaw is disabled (${featureKey} is optional — graceful degradation)`,
  };
}

/**
 * Log once per caller that a callsite was skipped.
 * Prevents log spam during long-running processes.
 */
export function openclawSkipLog(caller: string): void {
  if (_logged.has(caller)) return;
  _logged.add(caller);
  console.log(`[openclaw-gate] ${caller} skipped — OPENCLAW_ENABLED=false`);
}

/**
 * Environment Variable Validation
 * ================================
 * Single source of truth for all env var classification and validation.
 *
 * Classification:
 *   REQUIRED_AT_BOOT  — app cannot start without it
 *   FEATURE_REQUIRED  — needed when a specific feature is used
 *   OPTIONAL           — enhances functionality, not critical
 *
 * Rules:
 *   - NEVER outputs secret values — only presence booleans
 *   - Feature guards return descriptive "not configured" messages
 *   - Boot validation logs warnings, does NOT crash the process
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnvClassification = 'REQUIRED_AT_BOOT' | 'FEATURE_REQUIRED' | 'OPTIONAL';

export interface EnvVarDef {
  key: string;
  classification: EnvClassification;
  system: string;
  description: string;
  /** Whether this is a NEXT_PUBLIC_ var (safe for client) */
  clientSafe?: boolean;
  /** Whether this is a secret that must never leak client-side */
  secret?: boolean;
}

export interface EnvCheck {
  key: string;
  required: boolean;
  present: boolean;
  notes?: string;
}

export interface EnvReport {
  ok: boolean;
  checks: EnvCheck[];
  warnings: string[];
  summary: {
    required_present: number;
    required_total: number;
    optional_present: number;
    optional_total: number;
  };
}

// ---------------------------------------------------------------------------
// Complete Env Var Registry
// ---------------------------------------------------------------------------

export const ENV_REGISTRY: EnvVarDef[] = [
  // ── Supabase (REQUIRED_AT_BOOT) ──────────────────────────────────────────
  { key: 'NEXT_PUBLIC_SUPABASE_URL', classification: 'REQUIRED_AT_BOOT', system: 'Supabase', description: 'Supabase project URL', clientSafe: true },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', classification: 'REQUIRED_AT_BOOT', system: 'Supabase', description: 'Supabase anonymous key (row-level security)', clientSafe: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', classification: 'REQUIRED_AT_BOOT', system: 'Supabase', description: 'Supabase service role key (bypasses RLS)', secret: true },

  // ── App Core (REQUIRED_AT_BOOT) ──────────────────────────────────────────
  { key: 'NEXT_PUBLIC_APP_URL', classification: 'REQUIRED_AT_BOOT', system: 'App', description: 'Public-facing app URL (e.g. https://app.flashflow.ai)', clientSafe: true },
  { key: 'ANTHROPIC_API_KEY', classification: 'REQUIRED_AT_BOOT', system: 'AI', description: 'Anthropic Claude API key — powers all AI features', secret: true },
  { key: 'ADMIN_USERS', classification: 'REQUIRED_AT_BOOT', system: 'Auth', description: 'Comma-separated admin email allowlist', secret: true },
  { key: 'CRON_SECRET', classification: 'REQUIRED_AT_BOOT', system: 'Cron', description: 'Bearer token for Vercel cron job authentication', secret: true },

  // ── Auth & Security (FEATURE_REQUIRED) ───────────────────────────────────
  { key: 'INTERNAL_SERVICE_TOKEN', classification: 'FEATURE_REQUIRED', system: 'Auth', description: 'Service-to-service auth token', secret: true },
  { key: 'INTERNAL_API_SECRET', classification: 'FEATURE_REQUIRED', system: 'Auth', description: 'Internal API secret for broll/agent dispatch', secret: true },
  { key: 'AGENT_DISPATCH_SECRET', classification: 'FEATURE_REQUIRED', system: 'Auth', description: 'Agent dispatch bearer token', secret: true },
  { key: 'CC_INGEST_KEY', classification: 'FEATURE_REQUIRED', system: 'Auth', description: 'Command center ingest key for agent runs', secret: true },
  { key: 'FINOPS_INGEST_KEY', classification: 'FEATURE_REQUIRED', system: 'Auth', description: 'FinOps data ingest key', secret: true },
  { key: 'SERVICE_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Auth', description: 'Service API key for revenue endpoint', secret: true },
  { key: 'OWNER_EMAILS', classification: 'OPTIONAL', system: 'Auth', description: 'Comma-separated owner email list (defaults to spiderbuttons@gmail.com)' },

  // ── Stripe (FEATURE_REQUIRED) ────────────────────────────────────────────
  { key: 'STRIPE_SECRET_KEY', classification: 'FEATURE_REQUIRED', system: 'Stripe', description: 'Stripe secret key for billing', secret: true },
  { key: 'STRIPE_WEBHOOK_SECRET', classification: 'FEATURE_REQUIRED', system: 'Stripe', description: 'Stripe webhook signing secret', secret: true },
  { key: 'STRIPE_PRICE_CREATOR_LITE', classification: 'FEATURE_REQUIRED', system: 'Stripe', description: 'Stripe price ID for Creator Lite plan' },
  { key: 'STRIPE_PRICE_CREATOR_PRO', classification: 'FEATURE_REQUIRED', system: 'Stripe', description: 'Stripe price ID for Creator Pro plan' },
  { key: 'STRIPE_PRICE_BUSINESS', classification: 'FEATURE_REQUIRED', system: 'Stripe', description: 'Stripe price ID for Business plan' },
  { key: 'STRIPE_PRICE_CREDITS_25', classification: 'OPTIONAL', system: 'Stripe', description: 'Stripe price ID for 25-credit pack' },
  { key: 'STRIPE_PRICE_CREDITS_100', classification: 'OPTIONAL', system: 'Stripe', description: 'Stripe price ID for 100-credit pack' },
  { key: 'STRIPE_PRICE_CREDITS_500', classification: 'OPTIONAL', system: 'Stripe', description: 'Stripe price ID for 500-credit pack' },

  // ── TikTok (FEATURE_REQUIRED) ────────────────────────────────────────────
  { key: 'TIKTOK_CLIENT_KEY', classification: 'FEATURE_REQUIRED', system: 'TikTok', description: 'TikTok app client key (Login Kit)', secret: true },
  { key: 'TIKTOK_CLIENT_SECRET', classification: 'FEATURE_REQUIRED', system: 'TikTok', description: 'TikTok app client secret', secret: true },
  { key: 'TIKTOK_REDIRECT_URI', classification: 'FEATURE_REQUIRED', system: 'TikTok', description: 'TikTok OAuth redirect URI' },
  { key: 'TIKTOK_CONTENT_APP_KEY', classification: 'FEATURE_REQUIRED', system: 'TikTok Content', description: 'TikTok Content Posting app key', secret: true },
  { key: 'TIKTOK_CONTENT_APP_SECRET', classification: 'FEATURE_REQUIRED', system: 'TikTok Content', description: 'TikTok Content Posting app secret', secret: true },
  { key: 'TIKTOK_SHOP_APP_KEY', classification: 'FEATURE_REQUIRED', system: 'TikTok Shop', description: 'TikTok Shop app key', secret: true },
  { key: 'TIKTOK_SHOP_APP_SECRET', classification: 'FEATURE_REQUIRED', system: 'TikTok Shop', description: 'TikTok Shop app secret', secret: true },
  { key: 'TIKTOK_RESEARCH_CLIENT_KEY', classification: 'FEATURE_REQUIRED', system: 'TikTok Research', description: 'TikTok Research API client key', secret: true },
  { key: 'TIKTOK_RESEARCH_CLIENT_SECRET', classification: 'FEATURE_REQUIRED', system: 'TikTok Research', description: 'TikTok Research API client secret', secret: true },
  { key: 'TIKTOK_PARTNER_CLIENT_KEY', classification: 'OPTIONAL', system: 'TikTok', description: 'TikTok Partner API client key', secret: true },
  { key: 'TIKTOK_PARTNER_CLIENT_SECRET', classification: 'OPTIONAL', system: 'TikTok', description: 'TikTok Partner API client secret', secret: true },

  // ── Google Drive (FEATURE_REQUIRED) ──────────────────────────────────────
  { key: 'GOOGLE_DRIVE_CLIENT_ID', classification: 'FEATURE_REQUIRED', system: 'Google Drive', description: 'Google OAuth client ID for Drive intake' },
  { key: 'GOOGLE_DRIVE_CLIENT_SECRET', classification: 'FEATURE_REQUIRED', system: 'Google Drive', description: 'Google OAuth client secret', secret: true },
  { key: 'GOOGLE_DRIVE_REDIRECT_URI', classification: 'FEATURE_REQUIRED', system: 'Google Drive', description: 'Google OAuth redirect URI' },
  { key: 'DRIVE_ROOT_FOLDER_ID', classification: 'OPTIONAL', system: 'Google Drive', description: 'Default Drive folder ID for intake' },
  { key: 'DRIVE_TOKEN_ENCRYPTION_KEY', classification: 'FEATURE_REQUIRED', system: 'Google Drive', description: 'AES key for encrypting stored Drive tokens', secret: true },

  // ── HeyGen (FEATURE_REQUIRED) ────────────────────────────────────────────
  { key: 'HEYGEN_API_KEY', classification: 'FEATURE_REQUIRED', system: 'HeyGen', description: 'HeyGen API key for avatar video generation', secret: true },
  { key: 'HEYGEN_DAILY_ALERT_USD', classification: 'OPTIONAL', system: 'HeyGen', description: 'Daily spend alert threshold in USD' },
  { key: 'HEYGEN_USD_PER_CREDIT', classification: 'OPTIONAL', system: 'HeyGen', description: 'Cost per HeyGen credit in USD' },

  // ── Shotstack (FEATURE_REQUIRED) ─────────────────────────────────────────
  { key: 'SHOTSTACK_PRODUCTION_KEY', classification: 'FEATURE_REQUIRED', system: 'Shotstack', description: 'Shotstack production API key for video rendering', secret: true },
  { key: 'SHOTSTACK_SANDBOX_KEY', classification: 'OPTIONAL', system: 'Shotstack', description: 'Shotstack sandbox API key for testing', secret: true },
  { key: 'SHOTSTACK_ENV', classification: 'OPTIONAL', system: 'Shotstack', description: 'Shotstack environment (production/sandbox)' },

  // ── Runway (FEATURE_REQUIRED) ────────────────────────────────────────────
  { key: 'RUNWAY_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Runway', description: 'Runway ML API key for video generation', secret: true },

  // ── OpenClaw (FEATURE_REQUIRED) ──────────────────────────────────────────
  { key: 'OPENCLAW_API_URL', classification: 'FEATURE_REQUIRED', system: 'OpenClaw', description: 'OpenClaw API base URL' },
  { key: 'OPENCLAW_API_KEY', classification: 'FEATURE_REQUIRED', system: 'OpenClaw', description: 'OpenClaw API key for TikTok data', secret: true },
  { key: 'OPENCLAW_ENABLED', classification: 'OPTIONAL', system: 'OpenClaw', description: 'Enable/disable OpenClaw integration (true/false)' },

  // ── Telegram (FEATURE_REQUIRED) ──────────────────────────────────────────
  { key: 'TELEGRAM_BOT_TOKEN', classification: 'FEATURE_REQUIRED', system: 'Telegram', description: 'Telegram bot token for notifications', secret: true },
  { key: 'TELEGRAM_CHAT_ID', classification: 'FEATURE_REQUIRED', system: 'Telegram', description: 'Telegram chat ID for notifications' },
  { key: 'TELEGRAM_LOG_CHAT_ID', classification: 'OPTIONAL', system: 'Telegram', description: 'Separate chat for cron/log messages' },

  // ── Email (FEATURE_REQUIRED) ─────────────────────────────────────────────
  { key: 'RESEND_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Email', description: 'Resend API key for transactional email', secret: true },
  { key: 'RESEND_FROM_EMAIL', classification: 'OPTIONAL', system: 'Email', description: 'From address for Resend emails' },
  { key: 'SENDGRID_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Email', description: 'SendGrid API key (legacy email provider)', secret: true },
  { key: 'EMAIL_FROM', classification: 'OPTIONAL', system: 'Email', description: 'Default from email address' },

  // ── Sentry (OPTIONAL) ────────────────────────────────────────────────────
  { key: 'NEXT_PUBLIC_SENTRY_DSN', classification: 'OPTIONAL', system: 'Sentry', description: 'Sentry DSN for error tracking', clientSafe: true },
  { key: 'SENTRY_DSN', classification: 'OPTIONAL', system: 'Sentry', description: 'Server-side Sentry DSN' },

  // ── Late.dev (FEATURE_REQUIRED) ──────────────────────────────────────────
  { key: 'LATE_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Late.dev', description: 'Late.dev API key for social scheduling', secret: true },

  // ── Discord (FEATURE_REQUIRED) ───────────────────────────────────────────
  { key: 'DISCORD_BOT_TOKEN', classification: 'FEATURE_REQUIRED', system: 'Discord', description: 'Discord bot token', secret: true },
  { key: 'DISCORD_CLIENT_ID', classification: 'FEATURE_REQUIRED', system: 'Discord', description: 'Discord OAuth client ID' },
  { key: 'DISCORD_CLIENT_SECRET', classification: 'FEATURE_REQUIRED', system: 'Discord', description: 'Discord OAuth client secret', secret: true },
  { key: 'DISCORD_GUILD_ID', classification: 'FEATURE_REQUIRED', system: 'Discord', description: 'Discord server/guild ID' },

  // ── OpenAI (FEATURE_REQUIRED) ────────────────────────────────────────────
  { key: 'OPENAI_API_KEY', classification: 'FEATURE_REQUIRED', system: 'AI', description: 'OpenAI API key (transcription, embeddings)', secret: true },
  { key: 'ELEVENLABS_API_KEY', classification: 'FEATURE_REQUIRED', system: 'AI', description: 'ElevenLabs API key for TTS', secret: true },
  { key: 'REPLICATE_API_TOKEN', classification: 'FEATURE_REQUIRED', system: 'AI', description: 'Replicate API token for ML models', secret: true },

  // ── Scraping (FEATURE_REQUIRED) ──────────────────────────────────────────
  { key: 'SCRAPECREATORS_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Scraping', description: 'ScrapeCreators API key for TikTok data', secret: true },
  { key: 'SUPADATA_API_KEY', classification: 'FEATURE_REQUIRED', system: 'Scraping', description: 'Supadata API key for YouTube data', secret: true },
  { key: 'YOUTUBE_API_KEY', classification: 'FEATURE_REQUIRED', system: 'YouTube', description: 'YouTube Data API key', secret: true },
  { key: 'COBALT_API_URL', classification: 'OPTIONAL', system: 'Scraping', description: 'Cobalt API URL for video downloads' },
  { key: 'COBALT_API_KEY', classification: 'OPTIONAL', system: 'Scraping', description: 'Cobalt API key', secret: true },

  // ── Mission Control (FEATURE_REQUIRED) ───────────────────────────────────
  { key: 'MISSION_CONTROL_TOKEN', classification: 'FEATURE_REQUIRED', system: 'Mission Control', description: 'Mission Control auth token', secret: true },
  { key: 'MISSION_CONTROL_BASE_URL', classification: 'FEATURE_REQUIRED', system: 'Mission Control', description: 'Mission Control base URL' },

  // ── Slack (OPTIONAL) ─────────────────────────────────────────────────────
  { key: 'SLACK_WEBHOOK_URL', classification: 'OPTIONAL', system: 'Slack', description: 'Slack webhook URL for notifications' },

  // ── Outlook/CRM (FEATURE_REQUIRED) ──────────────────────────────────────
  { key: 'OUTLOOK_CLIENT_ID', classification: 'FEATURE_REQUIRED', system: 'Outlook', description: 'Microsoft OAuth client ID for CRM email sync' },
  { key: 'OUTLOOK_CLIENT_SECRET', classification: 'FEATURE_REQUIRED', system: 'Outlook', description: 'Microsoft OAuth client secret', secret: true },
  { key: 'OUTLOOK_TENANT_ID', classification: 'FEATURE_REQUIRED', system: 'Outlook', description: 'Microsoft Azure tenant ID' },
  { key: 'OUTLOOK_REFRESH_TOKEN', classification: 'FEATURE_REQUIRED', system: 'Outlook', description: 'Microsoft OAuth refresh token', secret: true },

  // ── Browser Service (FEATURE_REQUIRED) ──────────────────────────────────
  { key: 'BROWSER_SERVICE_URL', classification: 'FEATURE_REQUIRED', system: 'Browser Service', description: 'Remote browser service URL for TikTok automation' },
  { key: 'BROWSER_SERVICE_KEY', classification: 'FEATURE_REQUIRED', system: 'Browser Service', description: 'Browser service auth key', secret: true },

  // ── Client-safe vars ─────────────────────────────────────────────────────
  { key: 'NEXT_PUBLIC_OWNER_EMAILS', classification: 'OPTIONAL', system: 'App', description: 'Owner emails for client-side owner detection', clientSafe: true },
  { key: 'NEXT_PUBLIC_TIKTOK_REVIEW_MODE', classification: 'OPTIONAL', system: 'TikTok', description: 'TikTok app review mode flag', clientSafe: true },
  { key: 'NEXT_PUBLIC_APP_VERSION', classification: 'OPTIONAL', system: 'App', description: 'App version string', clientSafe: true },

  // ── Deployment (OPTIONAL) ────────────────────────────────────────────────
  { key: 'VERCEL_DEPLOY_HOOK', classification: 'OPTIONAL', system: 'Deployment', description: 'Vercel deploy hook URL for admin deploy button' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if an env var is present (non-empty). NEVER returns actual values. */
function isEnvPresent(key: string): boolean {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Boot Validation
// ---------------------------------------------------------------------------

/**
 * Validate required-at-boot env vars. Call during app initialization.
 * Logs warnings for missing vars but does NOT throw/crash.
 */
export function validateBootEnvVars(): { ok: boolean; missing: string[] } {
  const bootVars = ENV_REGISTRY.filter(v => v.classification === 'REQUIRED_AT_BOOT');
  const missing: string[] = [];

  for (const v of bootVars) {
    if (!isEnvPresent(v.key)) {
      missing.push(v.key);
      console.warn(`[env] MISSING REQUIRED: ${v.key} — ${v.description}`);
    }
  }

  if (missing.length > 0) {
    console.warn(`[env] ${missing.length} required env var(s) missing. Some features may fail.`);
  }

  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Feature Guards
// ---------------------------------------------------------------------------

export interface FeatureGuardResult {
  configured: boolean;
  missing: string[];
  message: string;
}

/** Check if all env vars for a specific system are configured. */
export function checkFeatureConfig(system: string): FeatureGuardResult {
  const vars = ENV_REGISTRY.filter(
    v => v.system === system && v.classification !== 'OPTIONAL'
  );

  const missing = vars.filter(v => !isEnvPresent(v.key)).map(v => v.key);

  if (missing.length === 0) {
    return { configured: true, missing: [], message: `${system} configured` };
  }

  return {
    configured: false,
    missing,
    message: `${system} integration disabled: ${missing.join(', ')} missing`,
  };
}

/**
 * Require a feature's env vars. Returns a descriptive error message if not configured.
 * Use at the top of feature entry points.
 *
 * Example:
 *   const guard = requireFeature('HeyGen');
 *   if (!guard.configured) return { error: guard.message };
 */
export function requireFeature(system: string): FeatureGuardResult {
  return checkFeatureConfig(system);
}

// ---------------------------------------------------------------------------
// Full Report (for diagnostics API)
// ---------------------------------------------------------------------------

export function getEnvReport(): EnvReport {
  const checks: EnvCheck[] = [];
  const warnings: string[] = [];

  let requiredPresent = 0;
  let optionalPresent = 0;
  let requiredTotal = 0;
  let optionalTotal = 0;

  for (const v of ENV_REGISTRY) {
    const present = isEnvPresent(v.key);
    const isRequired = v.classification === 'REQUIRED_AT_BOOT';

    checks.push({
      key: v.key,
      required: isRequired,
      present,
      notes: v.description,
    });

    if (isRequired) {
      requiredTotal++;
      if (present) requiredPresent++;
      else warnings.push(`Missing required env var: ${v.key}`);
    } else {
      optionalTotal++;
      if (present) optionalPresent++;
    }
  }

  return {
    ok: requiredPresent === requiredTotal,
    checks,
    warnings,
    summary: {
      required_present: requiredPresent,
      required_total: requiredTotal,
      optional_present: optionalPresent,
      optional_total: optionalTotal,
    },
  };
}

/**
 * Minimal env status for health checks. Returns only summary counts.
 */
export function getEnvSummary(): {
  env_ok: boolean;
  required_present: number;
  required_total: number;
  optional_present: number;
  optional_total: number;
} {
  const report = getEnvReport();
  return {
    env_ok: report.ok,
    required_present: report.summary.required_present,
    required_total: report.summary.required_total,
    optional_present: report.summary.optional_present,
    optional_total: report.summary.optional_total,
  };
}

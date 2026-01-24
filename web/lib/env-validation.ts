/**
 * Environment Variable Validation
 * Provides safe runtime checks for required/optional env vars.
 * NEVER outputs secret values - only presence booleans.
 */

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

// Required environment variables (must be present for core functionality)
const REQUIRED_ENV_KEYS: { key: string; notes?: string }[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", notes: "Supabase project URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", notes: "Supabase anonymous key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", notes: "Supabase service role key (server-side only)" },
];

// Optional environment variables (enhance functionality but not required)
const OPTIONAL_ENV_KEYS: { key: string; notes?: string }[] = [
  { key: "SENDGRID_API_KEY", notes: "Required for email notifications" },
  { key: "SLACK_WEBHOOK_URL", notes: "Required for Slack notifications" },
  { key: "OPS_EMAIL_TO", notes: "Ops team email for alerts" },
  { key: "DEFAULT_ADMIN_EMAIL", notes: "Default admin email for bootstrapping" },
];

/**
 * Check if an environment variable is present (non-empty).
 * NEVER returns the actual value - only a boolean.
 */
function isEnvPresent(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Get a safe environment report.
 * Returns presence checks for required/optional env vars.
 * NEVER exposes secret values.
 */
export function getEnvReport(): EnvReport {
  const checks: EnvCheck[] = [];
  const warnings: string[] = [];

  let requiredPresent = 0;
  let optionalPresent = 0;

  // Check required keys
  for (const { key, notes } of REQUIRED_ENV_KEYS) {
    const present = isEnvPresent(key);
    checks.push({ key, required: true, present, notes });
    if (present) {
      requiredPresent++;
    } else {
      warnings.push(`Missing required env var: ${key}`);
    }
  }

  // Check optional keys
  for (const { key, notes } of OPTIONAL_ENV_KEYS) {
    const present = isEnvPresent(key);
    checks.push({ key, required: false, present, notes });
    if (present) {
      optionalPresent++;
    }
  }

  const requiredTotal = REQUIRED_ENV_KEYS.length;
  const optionalTotal = OPTIONAL_ENV_KEYS.length;
  const ok = requiredPresent === requiredTotal;

  return {
    ok,
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
 * Get a minimal env status for health checks.
 * Returns only summary counts, no details.
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

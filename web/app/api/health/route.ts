import { NextResponse } from "next/server";
import { getEnvSummary } from "@/lib/env-validation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  responseTime?: number;
}

export async function GET() {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];

  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Get environment validation summary
  const envSummary = getEnvSummary();

  // Environment check
  checks.push({
    name: 'environment',
    status: envSummary.env_ok ? 'pass' : 'fail',
    message: envSummary.env_ok ? undefined : `Missing ${envSummary.required_total - envSummary.required_present} required vars`,
  });

  // Database connectivity check
  const dbStart = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('user_id')
      .limit(1);

    checks.push({
      name: 'database',
      status: error ? 'fail' : 'pass',
      message: error?.message,
      responseTime: Date.now() - dbStart,
    });
  } catch (err) {
    checks.push({
      name: 'database',
      status: 'fail',
      message: err instanceof Error ? err.message : 'Connection failed',
      responseTime: Date.now() - dbStart,
    });
  }

  // Stripe configuration check
  checks.push({
    name: 'stripe',
    status: process.env.STRIPE_SECRET_KEY ? 'pass' : 'fail',
    message: process.env.STRIPE_SECRET_KEY ? undefined : 'Not configured',
  });

  // Determine overall status
  const failedChecks = checks.filter((c) => c.status === 'fail');
  const dbFailed = failedChecks.some((c) => c.name === 'database');

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (dbFailed) {
    status = 'unhealthy';
  } else if (failedChecks.length > 0) {
    status = 'degraded';
  }

  const response = {
    ok: status !== 'unhealthy',
    status,
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    checks,
    // Backward compatible fields
    env: {
      NEXT_PUBLIC_SUPABASE_URL: hasSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hasAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: hasServiceKey
    },
    SUPABASE_SERVICE_ROLE_KEY_PRESENT: hasServiceKey,
    USING_SERVICE_ROLE_FOR_ADMIN: hasServiceKey,
    // New env_report summary (additive)
    env_report: {
      env_ok: envSummary.env_ok,
      required_present: envSummary.required_present,
      required_total: envSummary.required_total,
      optional_present: envSummary.optional_present,
      optional_total: envSummary.optional_total,
    },
  };

  return NextResponse.json(response, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}

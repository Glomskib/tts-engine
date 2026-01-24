import { NextResponse } from "next/server";
import { getEnvSummary } from "@/lib/env-validation";

export async function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Get environment validation summary
  const envSummary = getEnvSummary();

  return NextResponse.json({
    ok: true,
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
  });
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { ENV_REGISTRY } from "@/lib/env-validation";
import { getSystemConfigStatus } from "@/lib/config-status";

export const runtime = "nodejs";
export const maxDuration = 300;

interface DiagnosticCheck {
  name: string;
  status: "green" | "yellow" | "red";
  message: string;
  fix?: string;
}

const REQUIRED_TABLES = [
  "products",
  "videos",
  "saved_skits",
  "tiktok_accounts",
  "winners_bank",
  "audience_personas",
  "content_packages",
  "script_of_the_day",
  "daily_summaries",
  "va_briefs",
  "winner_pattern_analyses",
  "script_presets",
];

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  // Auth check - must be admin
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId
    );
  }

  const checks: DiagnosticCheck[] = [];

  // ── a. Environment Variables (from registry) ─────────────────────────────

  for (const v of ENV_REGISTRY) {
    const isSet = !!process.env[v.key]?.trim();

    if (isSet) {
      checks.push({
        name: `Env: ${v.key}`,
        status: "green",
        message: `Set — ${v.description}`,
      });
    } else if (v.classification === "REQUIRED_AT_BOOT") {
      checks.push({
        name: `Env: ${v.key}`,
        status: "red",
        message: `Missing (required) — ${v.description}`,
        fix: `Set ${v.key} in your deployment environment`,
      });
    } else if (v.classification === "FEATURE_REQUIRED") {
      checks.push({
        name: `Env: ${v.key}`,
        status: "yellow",
        message: `Missing — ${v.description}`,
        fix: `Set ${v.key} to enable ${v.system}`,
      });
    } else {
      checks.push({
        name: `Env: ${v.key}`,
        status: "yellow",
        message: `Missing (optional) — ${v.description}`,
        fix: `Set ${v.key} to enable this feature`,
      });
    }
  }

  // ── b. Integration Status Summary ────────────────────────────────────────

  const configStatus = getSystemConfigStatus();
  for (const integration of configStatus.integrations) {
    if (integration.configured) {
      checks.push({
        name: `Integration: ${integration.name}`,
        status: "green",
        message: "Fully configured",
      });
    } else {
      checks.push({
        name: `Integration: ${integration.name}`,
        status: "yellow",
        message: `Missing: ${integration.missing.join(", ")}`,
        fix: `Configure ${integration.name} by setting: ${integration.missing.join(", ")}`,
      });
    }
  }

  // ── c. Database Connection ───────────────────────────────────────────────

  try {
    const { error } = await supabaseAdmin
      .from("products")
      .select("id")
      .limit(1);
    if (error) {
      checks.push({
        name: "Database Connection",
        status: "red",
        message: `Connection failed: ${error.message}`,
        fix: "Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct",
      });
    } else {
      checks.push({
        name: "Database Connection",
        status: "green",
        message: "Connected successfully",
      });
    }
  } catch (err) {
    checks.push({
      name: "Database Connection",
      status: "red",
      message: `Connection error: ${err instanceof Error ? err.message : "Unknown error"}`,
      fix: "Check Supabase project status and credentials",
    });
  }

  // ── d. Required Tables ───────────────────────────────────────────────────

  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await supabaseAdmin.from(table).select("*").limit(0);
      if (error) {
        checks.push({
          name: `Table: ${table}`,
          status: "red",
          message: `Table missing or inaccessible: ${error.message}`,
          fix: `Run the migration that creates the '${table}' table`,
        });
      } else {
        checks.push({
          name: `Table: ${table}`,
          status: "green",
          message: "Exists",
        });
      }
    } catch {
      checks.push({
        name: `Table: ${table}`,
        status: "red",
        message: "Query failed",
        fix: `Verify the '${table}' table exists in your database`,
      });
    }
  }

  // ── e. Products Exist ────────────────────────────────────────────────────

  try {
    const { count, error } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true });
    if (error) {
      checks.push({
        name: "Products Exist",
        status: "red",
        message: `Could not count products: ${error.message}`,
        fix: "Add at least one product in the admin dashboard",
      });
    } else if ((count ?? 0) > 0) {
      checks.push({
        name: "Products Exist",
        status: "green",
        message: `${count} product(s) found`,
      });
    } else {
      checks.push({
        name: "Products Exist",
        status: "red",
        message: "No products found",
        fix: "Add at least one product in the admin dashboard to enable the pipeline",
      });
    }
  } catch {
    checks.push({
      name: "Products Exist",
      status: "red",
      message: "Failed to check products",
      fix: "Ensure the products table exists and is accessible",
    });
  }

  // ── f. Personas Exist ────────────────────────────────────────────────────

  try {
    const { count, error } = await supabaseAdmin
      .from("audience_personas")
      .select("id", { count: "exact", head: true });
    if (error) {
      checks.push({
        name: "Personas Exist",
        status: "red",
        message: `Could not count personas: ${error.message}`,
        fix: "Add audience personas for content generation",
      });
    } else if ((count ?? 0) > 0) {
      checks.push({
        name: "Personas Exist",
        status: "green",
        message: `${count} persona(s) found`,
      });
    } else {
      checks.push({
        name: "Personas Exist",
        status: "yellow",
        message: "No personas found",
        fix: "Add audience personas to improve AI-generated content targeting",
      });
    }
  } catch {
    checks.push({
      name: "Personas Exist",
      status: "yellow",
      message: "Failed to check personas",
      fix: "Ensure the audience_personas table exists",
    });
  }

  // ── g. API Key Configured ───────────────────────────────────────────────

  try {
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id")
      .is("revoked_at", null)
      .limit(1);
    if (error) {
      checks.push({
        name: "API Key Configured",
        status: "yellow",
        message: `Could not check API keys: ${error.message}`,
        fix: "Create an API key in Settings > API Keys for external integrations",
      });
    } else if (data && data.length > 0) {
      checks.push({
        name: "API Key Configured",
        status: "green",
        message: "At least one active API key exists",
      });
    } else {
      checks.push({
        name: "API Key Configured",
        status: "yellow",
        message: "No active API keys found",
        fix: "Create an API key in Settings > API Keys to enable external integrations (e.g., OpenClaw)",
      });
    }
  } catch {
    checks.push({
      name: "API Key Configured",
      status: "yellow",
      message: "Failed to check API keys",
      fix: "Ensure the api_keys table exists",
    });
  }

  // ── Calculate health score ───────────────────────────────────────────────

  const totalChecks = checks.length;
  const passed = checks.filter((c) => c.status === "green").length;
  const warnings = checks.filter((c) => c.status === "yellow").length;
  const failed = checks.filter((c) => c.status === "red").length;
  const healthScore = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0;

  const response = NextResponse.json({
    ok: true,
    data: {
      checks,
      health_score: healthScore,
      total_checks: totalChecks,
      passed,
      warnings,
      failed,
      config_status: {
        boot_ok: configStatus.boot_ok,
        integrations_configured: configStatus.summary.configured,
        integrations_total: configStatus.summary.total,
        boot_missing: configStatus.summary.boot_missing,
      },
    },
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

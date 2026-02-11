import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

interface DiagnosticCheck {
  name: string;
  status: "green" | "yellow" | "red";
  message: string;
  fix?: string;
}

// Environment variables to check: [name, required]
const ENV_VARS: [string, boolean][] = [
  // Required
  ["NEXT_PUBLIC_SUPABASE_URL", true],
  ["SUPABASE_SERVICE_ROLE_KEY", true],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", true],
  ["ANTHROPIC_API_KEY", true],
  ["NEXT_PUBLIC_APP_URL", true],
  ["ADMIN_USERS", true],
  // Optional AI
  ["OPENAI_API_KEY", false],
  ["REPLICATE_API_TOKEN", false],
  ["ELEVENLABS_API_KEY", false],
  // Optional payments
  ["STRIPE_SECRET_KEY", false],
  ["STRIPE_WEBHOOK_SECRET", false],
  // Optional notifications
  ["TELEGRAM_BOT_TOKEN", false],
  ["TELEGRAM_CHAT_ID", false],
  ["SENDGRID_API_KEY", false],
  ["SLACK_WEBHOOK_URL", false],
  // Optional scraping
  ["SCRAPECREATORS_API_KEY", false],
  // Optional deployment
  ["VERCEL_DEPLOY_HOOK", false],
  ["CRON_SECRET", false],
];

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

  // a. Environment Variables
  for (const [name, required] of ENV_VARS) {
    const isSet = !!process.env[name];
    if (isSet) {
      checks.push({
        name: `Env: ${name}`,
        status: "green",
        message: "Set",
      });
    } else if (required) {
      checks.push({
        name: `Env: ${name}`,
        status: "red",
        message: "Missing (required)",
        fix: `Set the ${name} environment variable in your deployment settings`,
      });
    } else {
      checks.push({
        name: `Env: ${name}`,
        status: "yellow",
        message: "Missing (optional)",
        fix: `Set ${name} to enable this feature`,
      });
    }
  }

  // b. Database Connection
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

  // c. Required Tables
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

  // d. Products Exist
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

  // e. Personas Exist
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

  // f. API Key Configured
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

  // g. Content Generation
  const anthropicSet = !!process.env.ANTHROPIC_API_KEY;
  checks.push({
    name: "Content Generation",
    status: anthropicSet ? "green" : "red",
    message: anthropicSet
      ? "ANTHROPIC_API_KEY is configured"
      : "ANTHROPIC_API_KEY is not set",
    ...(anthropicSet
      ? {}
      : {
          fix: "Set ANTHROPIC_API_KEY to enable AI script generation and content features",
        }),
  });

  // h. Telegram Bot
  const telegramTokenSet = !!process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatIdSet = !!process.env.TELEGRAM_CHAT_ID;
  if (telegramTokenSet && telegramChatIdSet) {
    checks.push({
      name: "Telegram Bot",
      status: "green",
      message: "Both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured",
    });
  } else if (telegramTokenSet || telegramChatIdSet) {
    checks.push({
      name: "Telegram Bot",
      status: "yellow",
      message: `Partial config: ${telegramTokenSet ? "token set" : "token missing"}, ${telegramChatIdSet ? "chat ID set" : "chat ID missing"}`,
      fix: `Set ${!telegramTokenSet ? "TELEGRAM_BOT_TOKEN" : "TELEGRAM_CHAT_ID"} to enable Telegram notifications`,
    });
  } else {
    checks.push({
      name: "Telegram Bot",
      status: "yellow",
      message: "Not configured",
      fix: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable Telegram notifications",
    });
  }

  // Calculate health score
  const totalChecks = checks.length;
  const passed = checks.filter((c) => c.status === "green").length;
  const warnings = checks.filter((c) => c.status === "yellow").length;
  const failed = checks.filter((c) => c.status === "red").length;
  const healthScore = Math.round((passed / totalChecks) * 100);

  const response = NextResponse.json({
    ok: true,
    data: {
      checks,
      health_score: healthScore,
      total_checks: totalChecks,
      passed,
      warnings,
      failed,
    },
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

#!/usr/bin/env npx tsx
/**
 * verify-launch.ts — Pre-launch deployment verification
 *
 * Checks:
 *   1. Stripe marketplace tier price IDs configured
 *   2. Marketplace migrations applied (tables exist)
 *   3. Heartbeat columns exist on edit_jobs
 *   4. Required env vars present
 *
 * Usage:
 *   npx tsx scripts/verify-launch.ts
 *
 * Exit code 0 = all checks pass, 1 = failures detected.
 */

import { createClient } from "@supabase/supabase-js";

// ── Setup ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let passed = 0;
let failed = 0;

function pass(label: string, detail?: string) {
  passed++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

// ── 1. Environment Variables ───────────────────────────────

function checkEnvVars() {
  console.log("\n[1/4] Environment Variables\n");

  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "INTERNAL_SERVICE_TOKEN",
  ];

  for (const key of required) {
    if (process.env[key]?.trim()) {
      pass(key);
    } else {
      fail(key, "missing or empty");
    }
  }
}

// ── 2. Stripe Tier Mapping ─────────────────────────────────

function checkStripeTiers() {
  console.log("\n[2/4] Stripe Marketplace Tier Mapping\n");

  const tierEnvVars: Record<string, string> = {
    pool_15: "STRIPE_PRICE_MP_POOL",
    dedicated_30: "STRIPE_PRICE_MP_DEDICATED",
    scale_50: "STRIPE_PRICE_MP_SCALE",
  };

  for (const [tier, envVar] of Object.entries(tierEnvVars)) {
    const val = process.env[envVar]?.trim();
    if (val) {
      pass(`${tier} → ${envVar}`, val.slice(0, 12) + "...");
    } else {
      // These are optional at launch (custom onboarding), so warn not fail
      console.log(`  ⚠ ${tier} → ${envVar} — not set (OK if using manual onboarding)`);
    }
  }

  // Core Stripe keys
  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    pass("STRIPE_SECRET_KEY");
  } else {
    fail("STRIPE_SECRET_KEY", "missing");
  }
}

// ── 3. Migrations (tables exist) ──────────────────────────

async function checkMigrations() {
  console.log("\n[3/4] Marketplace Tables\n");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail("Supabase connection", "URL or service role key missing — skipping DB checks");
    return;
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const requiredTables = [
    "edit_jobs",
    "mp_scripts",
    "mp_profiles",
    "clients",
    "client_plans",
    "client_memberships",
    "va_profiles",
    "plan_usage_daily",
    "script_assets",
    "job_feedback",
    "job_deliverables",
    "job_events",
    "broll_assets",
  ];

  for (const table of requiredTables) {
    try {
      const { error } = await db
        .from(table)
        .select("*", { count: "exact", head: true })
        .limit(0);

      if (error) {
        // 42P01 = table doesn't exist
        if (error.code === "42P01" || error.message.includes("does not exist")) {
          fail(table, "table not found — migration missing");
        } else {
          fail(table, error.message);
        }
      } else {
        pass(table);
      }
    } catch (err) {
      fail(table, err instanceof Error ? err.message : "query failed");
    }
  }
}

// ── 4. Heartbeat Columns ──────────────────────────────────

async function checkHeartbeatColumns() {
  console.log("\n[4/4] Heartbeat & Ops Columns on edit_jobs\n");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail("Supabase connection", "skipping column checks");
    return;
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const requiredColumns = [
    "last_heartbeat_at",
    "claimed_at",
    "started_at",
    "submitted_at",
    "approved_at",
    "due_at",
  ];

  // Probe each column by selecting it — Supabase returns an error if it doesn't exist
  for (const col of requiredColumns) {
    try {
      const { error } = await db
        .from("edit_jobs")
        .select(col)
        .limit(0);

      if (error) {
        fail(`edit_jobs.${col}`, error.message);
      } else {
        pass(`edit_jobs.${col}`);
      }
    } catch (err) {
      fail(`edit_jobs.${col}`, err instanceof Error ? err.message : "check failed");
    }
  }
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  FlashFlow Launch Verification");
  console.log("═══════════════════════════════════════");

  checkEnvVars();
  checkStripeTiers();
  await checkMigrations();
  await checkHeartbeatColumns();

  console.log("\n═══════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

/**
 * GET /api/health/schema
 *
 * Schema compatibility check endpoint for operators and debugging.
 * Returns detailed pass/fail results for all schema checks.
 *
 * This endpoint:
 * - NEVER redirects
 * - NEVER crashes (all errors caught)
 * - Always returns JSON with ok: true | false
 */

import { NextResponse } from "next/server";
import { checkSchema, type SchemaCheckResult } from "@/lib/schema-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthSchemaResponse {
  ok: boolean;
  checked_at: string;
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    critical_errors: number;
    warnings: number;
  };
  checks: SchemaCheckResult["checks"];
  critical_errors: string[];
  warnings: string[];
  error?: string;
}

export async function GET(): Promise<NextResponse<HealthSchemaResponse>> {
  try {
    // Force a fresh check (ignore cache for health endpoint)
    const result = await checkSchema(true);

    const passed = result.checks.filter((c) => c.passed).length;
    const failed = result.checks.filter((c) => !c.passed).length;

    const response: HealthSchemaResponse = {
      ok: result.ok,
      checked_at: result.checked_at,
      summary: {
        total_checks: result.checks.length,
        passed,
        failed,
        critical_errors: result.critical_errors.length,
        warnings: result.warnings.length,
      },
      checks: result.checks,
      critical_errors: result.critical_errors,
      warnings: result.warnings,
    };

    // Return 200 even if schema is invalid - the ok: false indicates the issue
    // This ensures the endpoint itself doesn't "fail" in monitoring tools
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    // Catch-all: endpoint must never crash
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    const response: HealthSchemaResponse = {
      ok: false,
      checked_at: new Date().toISOString(),
      summary: {
        total_checks: 0,
        passed: 0,
        failed: 0,
        critical_errors: 1,
        warnings: 0,
      },
      checks: [],
      critical_errors: [`Schema check failed to execute: ${errorMessage}`],
      warnings: [],
      error: errorMessage,
    };

    return NextResponse.json(response, {
      status: 200, // Still 200 - the ok: false tells the story
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      },
    });
  }
}

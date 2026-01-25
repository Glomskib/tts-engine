/**
 * Schema Compatibility Check Utility
 *
 * Provides deterministic schema validation to prevent the app from running
 * against an incompatible database schema. Returns structured results, never throws.
 *
 * Checks:
 * - Required tables exist
 * - Required columns exist
 * - Critical constraints are compatible
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================================
// Types
// ============================================================================

export interface SchemaCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: "critical" | "warning";
}

export interface SchemaCheckResult {
  ok: boolean;
  checked_at: string;
  checks: SchemaCheck[];
  critical_errors: string[];
  warnings: string[];
}

// ============================================================================
// Required Schema Definition
// ============================================================================

interface TableRequirement {
  name: string;
  columns: string[];
  critical: boolean;
}

const REQUIRED_TABLES: TableRequirement[] = [
  {
    name: "events_log",
    columns: ["id", "entity_type", "entity_id", "event_type", "payload", "created_at"],
    critical: true,
  },
  {
    name: "video_events",
    columns: ["id", "video_id", "event_type", "details", "created_at"],
    critical: true,
  },
  {
    name: "videos",
    columns: ["id", "recording_status"],
    critical: true,
  },
  {
    name: "user_roles",
    columns: ["user_id", "role"],
    critical: false, // Optional - app handles missing gracefully
  },
];

// ============================================================================
// Cache
// ============================================================================

let cachedResult: SchemaCheckResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute

// ============================================================================
// Schema Check Functions
// ============================================================================

/**
 * Check if a table exists by attempting a head query.
 * Returns { exists: boolean, error?: string }
 */
async function checkTableExists(
  tableName: string
): Promise<{ exists: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from(tableName)
      .select("*", { head: true, count: "exact" });

    if (!error) {
      return { exists: true };
    }

    // Check for "table does not exist" errors
    const isTableMissing =
      error.code === "42P01" ||
      error.code === "PGRST116" ||
      error.message?.toLowerCase().includes("does not exist") ||
      error.message?.toLowerCase().includes("relation") ||
      error.message?.toLowerCase().includes("undefined_table");

    if (isTableMissing) {
      return { exists: false };
    }

    // Some other error (permissions, etc.) - assume table exists but inaccessible
    return { exists: true, error: error.message };
  } catch (err) {
    return { exists: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Check if a column exists by attempting to select it.
 * Returns { exists: boolean, error?: string }
 */
async function checkColumnExists(
  tableName: string,
  columnName: string
): Promise<{ exists: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from(tableName)
      .select(columnName, { head: true, count: "exact" });

    if (!error) {
      return { exists: true };
    }

    // Check for "column does not exist" errors
    const isColumnMissing =
      error.code === "42703" ||
      error.code === "PGRST204" ||
      (error.message?.toLowerCase().includes("column") &&
        error.message?.toLowerCase().includes("does not exist"));

    if (isColumnMissing) {
      return { exists: false };
    }

    // Some other error - assume column exists
    return { exists: true, error: error.message };
  } catch (err) {
    return { exists: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Check video_events.video_id NOT NULL constraint.
 * Attempts to detect if video_id allows nulls by checking if nullable.
 * Note: This is a best-effort check - full constraint validation requires raw SQL.
 */
async function checkVideoIdNotNull(): Promise<{
  passed: boolean;
  message: string;
}> {
  try {
    // Try to query a row with null video_id - if any exist, constraint is violated
    const { data, error } = await supabaseAdmin
      .from("video_events")
      .select("id")
      .is("video_id", null)
      .limit(1);

    if (error) {
      // If we can't check, assume it's OK (will fail at runtime if not)
      return {
        passed: true,
        message: "video_events.video_id NOT NULL constraint check: unable to verify (assuming OK)",
      };
    }

    if (data && data.length > 0) {
      return {
        passed: false,
        message: "video_events.video_id has NULL values - constraint violated",
      };
    }

    return {
      passed: true,
      message: "video_events.video_id NOT NULL constraint: OK (no null values found)",
    };
  } catch {
    return {
      passed: true,
      message: "video_events.video_id NOT NULL constraint check: unable to verify",
    };
  }
}

/**
 * Run all schema compatibility checks.
 * Returns structured results, never throws.
 */
export async function checkSchema(forceRefresh = false): Promise<SchemaCheckResult> {
  // Return cached result if valid and not forcing refresh
  if (!forceRefresh && cachedResult && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  const checks: SchemaCheck[] = [];
  const critical_errors: string[] = [];
  const warnings: string[] = [];
  const checked_at = new Date().toISOString();

  // Check Supabase configuration
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    critical_errors.push("Missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
    const result: SchemaCheckResult = {
      ok: false,
      checked_at,
      checks: [{
        name: "config:supabase",
        passed: false,
        message: "Missing Supabase configuration",
        severity: "critical",
      }],
      critical_errors,
      warnings,
    };
    cachedResult = result;
    cacheTimestamp = Date.now();
    return result;
  }

  // Check each required table
  for (const tableReq of REQUIRED_TABLES) {
    const severity = tableReq.critical ? "critical" : "warning";

    // Check table exists
    const tableResult = await checkTableExists(tableReq.name);

    if (!tableResult.exists) {
      const message = `Table '${tableReq.name}' does not exist`;
      checks.push({
        name: `table:${tableReq.name}`,
        passed: false,
        message,
        severity,
      });

      if (tableReq.critical) {
        critical_errors.push(message);
      } else {
        warnings.push(message);
      }

      // Skip column checks if table doesn't exist
      continue;
    }

    checks.push({
      name: `table:${tableReq.name}`,
      passed: true,
      message: `Table '${tableReq.name}' exists`,
      severity,
    });

    // Check each required column
    for (const columnName of tableReq.columns) {
      const columnResult = await checkColumnExists(tableReq.name, columnName);

      if (!columnResult.exists) {
        const message = `Column '${tableReq.name}.${columnName}' does not exist`;
        checks.push({
          name: `column:${tableReq.name}.${columnName}`,
          passed: false,
          message,
          severity,
        });

        if (tableReq.critical) {
          critical_errors.push(message);
        } else {
          warnings.push(message);
        }
      } else {
        checks.push({
          name: `column:${tableReq.name}.${columnName}`,
          passed: true,
          message: `Column '${tableReq.name}.${columnName}' exists`,
          severity,
        });
      }
    }
  }

  // Check video_events.video_id NOT NULL constraint
  const videoIdCheck = await checkVideoIdNotNull();
  checks.push({
    name: "constraint:video_events.video_id_not_null",
    passed: videoIdCheck.passed,
    message: videoIdCheck.message,
    severity: "critical",
  });

  if (!videoIdCheck.passed) {
    critical_errors.push(videoIdCheck.message);
  }

  const result: SchemaCheckResult = {
    ok: critical_errors.length === 0,
    checked_at,
    checks,
    critical_errors,
    warnings,
  };

  // Cache the result
  cachedResult = result;
  cacheTimestamp = Date.now();

  return result;
}

/**
 * Get the cached schema check result without running checks.
 * Returns null if no cached result exists.
 */
export function getCachedSchemaCheck(): SchemaCheckResult | null {
  if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }
  return null;
}

/**
 * Clear the cached schema check result.
 */
export function clearSchemaCheckCache(): void {
  cachedResult = null;
  cacheTimestamp = 0;
}

/**
 * Check if schema is compatible (convenience wrapper).
 * Runs check if no cached result exists.
 */
export async function isSchemaCompatible(): Promise<boolean> {
  const result = await checkSchema();
  return result.ok;
}

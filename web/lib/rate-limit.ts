/**
 * rate-limit.ts - Lightweight in-memory rate limiting for AI endpoints
 * Phase 2: Throughput Protection
 *
 * Limitations (acceptable for internal use):
 * - In-memory only - resets on server restart
 * - Per-instance - not shared across serverless instances
 * - No persistence - rate limits don't survive deployments
 *
 * For production high-availability, consider Redis-backed rate limiting.
 */

import { NextResponse } from "next/server";
import { createApiErrorResponse } from "./api-errors";

// Rate limit window in milliseconds
const WINDOW_MS = 60 * 1000; // 60 seconds

// Default limits
const DEFAULT_USER_LIMIT = 10; // requests per window
const DEFAULT_ORG_LIMIT = 50; // requests per window

// In-memory stores: Map<key, { count: number, windowStart: number }>
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const userLimits = new Map<string, RateLimitEntry>();
const orgLimits = new Map<string, RateLimitEntry>();

// Cleanup interval to prevent memory leaks (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupScheduled = false;

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;

  setInterval(() => {
    const now = Date.now();
    const expiredThreshold = now - WINDOW_MS * 2; // Keep entries for 2 windows

    for (const [key, entry] of userLimits) {
      if (entry.windowStart < expiredThreshold) {
        userLimits.delete(key);
      }
    }

    for (const [key, entry] of orgLimits) {
      if (entry.windowStart < expiredThreshold) {
        orgLimits.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Check and update rate limit for a key
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
function checkLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  // No entry or window expired - start fresh
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + WINDOW_MS,
    };
  }

  // Within window - check limit
  if (entry.count >= limit) {
    const resetAt = entry.windowStart + WINDOW_MS;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Increment and allow
  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.windowStart + WINDOW_MS,
  };
}

export interface RateLimitContext {
  userId?: string | null;
  orgId?: string | null;
  ip?: string | null;
}

export interface RateLimitOptions {
  userLimit?: number;
  orgLimit?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  userRemaining: number;
  orgRemaining: number | null;
  resetAt: number;
  limitType?: "user" | "org";
}

/**
 * Check rate limits for a request
 *
 * @param context - User/org/IP context for rate limiting
 * @param options - Optional custom limits
 * @returns RateLimitResult with allowed status and remaining counts
 */
export function checkRateLimits(
  context: RateLimitContext,
  options: RateLimitOptions = {}
): RateLimitResult {
  scheduleCleanup();

  const userLimit = options.userLimit ?? DEFAULT_USER_LIMIT;
  const orgLimit = options.orgLimit ?? DEFAULT_ORG_LIMIT;

  // Determine user key: prefer userId, fallback to IP
  const userKey = context.userId || context.ip || "anonymous";
  const userCheck = checkLimit(userLimits, userKey, userLimit);

  // If user limit exceeded, return immediately
  if (!userCheck.allowed) {
    return {
      allowed: false,
      userRemaining: 0,
      orgRemaining: null,
      resetAt: userCheck.resetAt,
      limitType: "user",
    };
  }

  // Check org limit if orgId provided
  let orgCheck: { allowed: boolean; remaining: number; resetAt: number } | null = null;
  if (context.orgId) {
    orgCheck = checkLimit(orgLimits, context.orgId, orgLimit);

    if (!orgCheck.allowed) {
      // Undo user increment since we're rejecting
      const userEntry = userLimits.get(userKey);
      if (userEntry && userEntry.count > 0) {
        userEntry.count--;
      }

      return {
        allowed: false,
        userRemaining: userCheck.remaining + 1, // Add back the one we just used
        orgRemaining: 0,
        resetAt: orgCheck.resetAt,
        limitType: "org",
      };
    }
  }

  return {
    allowed: true,
    userRemaining: userCheck.remaining,
    orgRemaining: orgCheck?.remaining ?? null,
    resetAt: Math.max(userCheck.resetAt, orgCheck?.resetAt ?? 0),
  };
}

/**
 * Create a rate limit error response with proper headers
 */
export function createRateLimitResponse(
  correlationId: string,
  result: RateLimitResult
): NextResponse {
  const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
  const limitType = result.limitType === "org" ? "organization" : "user";

  const response = createApiErrorResponse(
    "RATE_LIMITED",
    `Rate limit exceeded for ${limitType}. Try again in ${retryAfterSeconds} seconds.`,
    429,
    correlationId,
    {
      limit_type: result.limitType,
      retry_after_seconds: retryAfterSeconds,
      reset_at: new Date(result.resetAt).toISOString(),
    }
  );

  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set("X-RateLimit-Remaining", String(result.userRemaining));
  response.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));

  return response;
}

/**
 * Extract rate limit context from request
 * Used when auth context is not available
 */
export function extractRateLimitContext(request: Request): RateLimitContext {
  // Try to get IP from headers (common proxy headers)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || null;

  return { ip };
}

/**
 * Convenience function: check rate limits and return error response if exceeded
 * Returns null if allowed, NextResponse if rate limited
 */
export function enforceRateLimits(
  context: RateLimitContext,
  correlationId: string,
  options: RateLimitOptions = {}
): NextResponse | null {
  const result = checkRateLimits(context, options);

  if (!result.allowed) {
    return createRateLimitResponse(correlationId, result);
  }

  return null;
}

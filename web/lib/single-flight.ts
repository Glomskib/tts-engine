/**
 * single-flight.ts - Prevent concurrent operations for the same entity
 * Phase 3: AI Single-Flight Per Video
 *
 * When multiple requests arrive for the same entity (video_id, product_id, etc.),
 * only the first request executes the operation. Subsequent requests either:
 * - Wait for and share the result of the first request (dedupe mode)
 * - Return 409 CONFLICT immediately (reject mode)
 *
 * This prevents wasted AI API calls and ensures consistency.
 */

import { NextResponse } from "next/server";

// Store for in-flight operations: Map<key, Promise<T>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlightOperations = new Map<string, Promise<any>>();

// Store for tracking operation start times (for timeout cleanup)
const operationStartTimes = new Map<string, number>();

// Maximum operation duration before auto-cleanup (5 minutes)
const MAX_OPERATION_DURATION_MS = 5 * 60 * 1000;

// Cleanup interval (every minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupScheduled = false;

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;

  setInterval(() => {
    const now = Date.now();
    for (const [key, startTime] of operationStartTimes) {
      if (now - startTime > MAX_OPERATION_DURATION_MS) {
        // Operation has been running too long - likely a stuck promise
        console.warn(`[single-flight] Cleaning up stuck operation: ${key}`);
        inFlightOperations.delete(key);
        operationStartTimes.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

export interface SingleFlightOptions {
  /**
   * How to handle concurrent requests:
   * - "dedupe": Wait for and return the result of the in-flight operation
   * - "reject": Immediately return 409 CONFLICT
   */
  mode?: "dedupe" | "reject";
}

export interface SingleFlightResult<T> {
  /** Whether this was the primary execution or a dedupe */
  primary: boolean;
  /** The operation result */
  result: T;
}

/**
 * Check if an operation is currently in-flight for the given key
 */
export function isInFlight(key: string): boolean {
  return inFlightOperations.has(key);
}

/**
 * Execute an operation with single-flight guarantee
 *
 * @param key - Unique key for the operation (e.g., "video:uuid" or "product:uuid")
 * @param operation - Async function to execute
 * @param options - Single-flight options
 * @returns The operation result with metadata
 */
export async function singleFlight<T>(
  key: string,
  operation: () => Promise<T>,
  options: SingleFlightOptions = {}
): Promise<SingleFlightResult<T>> {
  scheduleCleanup();

  const mode = options.mode ?? "dedupe";

  // Check if operation is already in-flight
  const existingOperation = inFlightOperations.get(key);
  if (existingOperation) {
    if (mode === "reject") {
      throw new SingleFlightConflictError(key);
    }

    // Dedupe mode: wait for and return the existing operation's result
    console.log(`[single-flight] Deduping request for key: ${key}`);
    const result = await existingOperation;
    return { primary: false, result };
  }

  // This is the primary execution - create and store the promise
  const operationPromise = (async () => {
    try {
      return await operation();
    } finally {
      // Always clean up when done
      inFlightOperations.delete(key);
      operationStartTimes.delete(key);
    }
  })();

  inFlightOperations.set(key, operationPromise);
  operationStartTimes.set(key, Date.now());

  const result = await operationPromise;
  return { primary: true, result };
}

/**
 * Execute with single-flight, returning null if conflict (reject mode helper)
 */
export async function singleFlightOrNull<T>(
  key: string,
  operation: () => Promise<T>
): Promise<SingleFlightResult<T> | null> {
  try {
    return await singleFlight(key, operation, { mode: "reject" });
  } catch (error) {
    if (error instanceof SingleFlightConflictError) {
      return null;
    }
    throw error;
  }
}

/**
 * Error thrown when a single-flight operation is rejected due to conflict
 */
export class SingleFlightConflictError extends Error {
  public readonly key: string;

  constructor(key: string) {
    super(`Operation already in progress for key: ${key}`);
    this.name = "SingleFlightConflictError";
    this.key = key;
  }
}

/**
 * Create a standardized 409 CONFLICT response for single-flight conflicts
 */
export function createConflictResponse(
  correlationId: string,
  entityType: string = "entity"
): NextResponse {
  const body = {
    ok: false,
    error_code: "GENERATION_IN_PROGRESS",
    message: `Generation already in progress for this ${entityType}. Please wait for the current operation to complete.`,
    correlation_id: correlationId,
  };

  const response = NextResponse.json(body, { status: 409 });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

/**
 * Generate a single-flight key from entity identifiers
 */
export function generateFlightKey(
  prefix: string,
  ...ids: (string | undefined | null)[]
): string | null {
  const validIds = ids.filter((id): id is string => !!id && id.trim() !== "");
  if (validIds.length === 0) return null;
  return `${prefix}:${validIds.join(":")}`;
}

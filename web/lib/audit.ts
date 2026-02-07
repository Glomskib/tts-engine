/**
 * Audit Log Helper
 * Non-blocking, fail-safe audit logging with correlation IDs.
 * Never throws - gracefully degrades to console.error on failure.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { randomUUID } from "crypto";

// --- Types ---

export interface AuditLogEntry {
  correlation_id: string;
  event_type: string;
  entity_type: string;
  entity_id?: string | null;
  actor?: string | null;
  summary: string;
  details?: Record<string, unknown>;
}

// --- Correlation ID Management ---

const CORRELATION_HEADER = "x-correlation-id";

/**
 * Generate a new correlation ID.
 * Format: timestamp-random for easy sorting and uniqueness.
 */
export function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = randomUUID().slice(0, 8);
  return `${ts}-${rand}`;
}

/**
 * Get correlation ID from request headers, or generate a new one.
 * Checks both lowercase and mixed-case header names.
 */
export function getCorrelationId(request: Request): string {
  const fromHeader =
    request.headers.get(CORRELATION_HEADER) ||
    request.headers.get("X-Correlation-ID");
  if (fromHeader && fromHeader.trim().length > 0) {
    return fromHeader.trim();
  }
  return generateCorrelationId();
}

/**
 * Set correlation ID header on a Response or Headers object.
 * Returns the same object for chaining.
 */
export function setCorrelationIdHeader<T extends Response | Headers>(
  target: T,
  correlationId: string
): T {
  if (target instanceof Response) {
    // Response headers are immutable, need to create new response
    // Instead, caller should set header when creating response
    console.warn("Cannot modify Response headers directly. Set header during response creation.");
    return target;
  }
  target.set(CORRELATION_HEADER, correlationId);
  return target;
}

// --- Summary Sanitization ---

// Patterns to detect and redact PII
const PII_PATTERNS = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Phone numbers (various formats)
  /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  // SSN-like patterns
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  // Credit card-like patterns
  /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g,
];

/**
 * Sanitize summary text by redacting potential PII.
 * Replaces detected patterns with [REDACTED].
 */
export function sanitizeSummary(summary: string): string {
  let result = summary;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  // Truncate to reasonable length
  if (result.length > 500) {
    result = result.slice(0, 497) + "...";
  }
  return result;
}

// --- Audit Logging ---

/**
 * Log an audit entry. Non-blocking, fail-safe.
 * Errors are logged to console but never thrown.
 *
 * @param entry - The audit log entry to record
 * @returns Promise that resolves when logging is attempted (fire-and-forget safe)
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const sanitizedSummary = sanitizeSummary(entry.summary);

    const { error } = await supabaseAdmin.from("audit_log").insert({
      correlation_id: entry.correlation_id,
      event_type: entry.event_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id || null,
      actor: entry.actor || null,
      summary: sanitizedSummary,
      details: entry.details || {},
    });

    if (error) {
      console.error("[audit] Failed to write audit log:", error.message, {
        correlation_id: entry.correlation_id,
        event_type: entry.event_type,
      });
    }
  } catch (err) {
    // Never throw from audit logging
    console.error("[audit] Exception in audit logging:", err, {
      correlation_id: entry.correlation_id,
      event_type: entry.event_type,
    });
  }
}

/**
 * Fire-and-forget audit logging.
 * Use this when you don't want to await the audit log.
 * Errors are silently logged to console.
 */
export function auditLogAsync(entry: AuditLogEntry): void {
  auditLog(entry).catch(() => {
    // Already handled in auditLog, this is just to prevent unhandled rejection
  });
}

// --- Event Type Constants ---

export const AuditEventTypes = {
  VIDEO_POSTED: "video.posted",
  VIDEO_CLAIMED: "video.claimed",
  VIDEO_RELEASED: "video.released",
  VIDEO_DELETED: "video.deleted",
  HOOK_APPROVED: "hook.approved",
  HOOK_REJECTED: "hook.rejected",
  HOOK_WINNER: "hook.winner",
  HOOK_UNDERPERFORM: "hook.underperform",
  PRODUCT_UPDATED: "product.updated",
} as const;

export type AuditEventType = (typeof AuditEventTypes)[keyof typeof AuditEventTypes];

// --- Entity Type Constants ---

export const EntityTypes = {
  VIDEO: "video",
  HOOK: "hook",
  PRODUCT: "product",
} as const;

export type EntityType = (typeof EntityTypes)[keyof typeof EntityTypes];

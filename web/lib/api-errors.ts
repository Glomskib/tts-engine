// api-errors.ts - Standardized API error codes and responses
// Phase 3: Added GENERATION_IN_PROGRESS for single-flight

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | 'INVALID_UUID'
  | 'INVALID_STATUS'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_QUEUE'
  | 'NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'DB_ERROR'
  | 'BAD_REQUEST'
  | 'ALREADY_CLAIMED'
  | 'NOT_CLAIMED'
  | 'CLAIM_NOT_OWNED'
  | 'CLAIM_REQUIRED'
  | 'PRECONDITION_FAILED'
  | 'REASON_REQUIRED'
  | 'INVALID_SCRIPT_JSON'
  | 'SCRIPT_NOT_APPROVED'
  | 'SCRIPT_ALREADY_LOCKED'
  | 'AI_ERROR'
  | 'VALIDATION_ERROR'
  | 'INVALID_RECORDING_STATUS'
  | 'MISSING_POSTED_FIELDS'
  | 'MISSING_VIDEO_URL'
  | 'MISSING_REJECTION_NOTES'
  | 'ROLE_MISMATCH'
  | 'INVALID_ROLE'
  | 'HANDOFF_NOT_ALLOWED'
  | 'MISSING_ACTOR'
  | 'FORBIDDEN'
  | 'NOT_CLAIM_OWNER'
  | 'UNAUTHORIZED'
  | 'NOT_AVAILABLE'
  | 'NOT_ASSIGNED_TO_YOU'
  | 'ASSIGNMENT_EXPIRED'
  | 'NO_WORK_AVAILABLE'
  | 'ALREADY_ASSIGNED'
  | 'CONFLICT'
  | 'WIP_LIMIT_REACHED'
  | 'SCRIPT_LOCKED'
  | 'SCRIPT_NOT_LOCKED'
  | 'COMPLIANCE_BLOCKED'
  | 'NO_SCRIPT'
  | 'POSTING_META_INCOMPLETE'
  | 'FINAL_ASSET_REQUIRED'
  | 'RATE_LIMITED'
  | 'GENERATION_IN_PROGRESS'
  | 'AI_PARSE'
  | 'AI_UNKNOWN'
  | 'INTERNAL'
  | 'CONFIG_ERROR'
  | 'INSUFFICIENT_CREDITS';

// Admin users who can use force=true bypass (environment-configurable)
export function getAdminUsers(): string[] {
  const envAdmins = process.env.ADMIN_USERS || '';
  const adminList = envAdmins.split(',').map(s => s.trim()).filter(Boolean);
  // Always include 'admin' as a default admin user
  if (!adminList.includes('admin')) {
    adminList.push('admin');
  }
  return adminList;
}

export function isAdminUser(actor: string | null | undefined): boolean {
  if (!actor) return false;
  return getAdminUsers().includes(actor);
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
  code: ApiErrorCode;
  details?: Record<string, unknown>;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  httpStatus: number,
  details?: Record<string, unknown>
): { body: ApiErrorResponse; status: number } {
  const body: ApiErrorResponse = {
    ok: false,
    error: message,
    code,
  };
  if (details) {
    body.details = details;
  }
  return { body, status: httpStatus };
}

export function generateCorrelationId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `vid_${Date.now()}_${random}`;
}

/**
 * Standardized API error response shape
 */
export interface StandardApiErrorResponse {
  ok: false;
  error_code: ApiErrorCode;
  message: string;
  correlation_id: string;
  details?: Record<string, unknown>;
}

/**
 * Create a standardized API error response with correlation_id header
 */
export function createApiErrorResponse(
  errorCode: ApiErrorCode,
  message: string,
  httpStatus: number,
  correlationId: string,
  details?: Record<string, unknown>
): NextResponse<StandardApiErrorResponse> {
  const body: StandardApiErrorResponse = {
    ok: false,
    error_code: errorCode,
    message,
    correlation_id: correlationId,
  };
  if (details) {
    body.details = details;
  }

  const response = NextResponse.json(body, { status: httpStatus });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

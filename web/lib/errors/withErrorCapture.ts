/**
 * Reusable async route handler wrapper for deterministic error capture.
 *
 * Wraps any Next.js API route handler (GET, POST, etc.) to:
 *   1. Catch unhandled exceptions
 *   2. Report to Sentry via captureRouteError() with structured tags
 *   3. Return a standardized 500 JSON response
 *   4. Avoid double-capture if the error was already reported
 *
 * Works for API routes, cron routes, and admin endpoints.
 *
 * Usage:
 *   export const GET = withErrorCapture(async (request) => {
 *     // ... handler logic ...
 *     return NextResponse.json({ ok: true });
 *   }, { routeName: '/api/cron/check-renders', feature: 'video-pipeline' });
 */

import { NextResponse } from 'next/server';
import { captureRouteError } from '@/lib/errorTracking';

// Symbol used to mark errors that have already been captured
const CAPTURED_SYMBOL = Symbol.for('__errorCaptured');

export interface ErrorCaptureOptions {
  /** Route path for Sentry tags (e.g. '/api/cron/check-renders') */
  routeName: string;
  /** Feature area for Sentry grouping (e.g. 'video-pipeline', 'finops') */
  feature?: string;
  /** Optional async resolver for the authenticated user ID */
  userIdResolver?: (request: Request) => Promise<string | undefined> | string | undefined;
  /** Optional async resolver for workspace/org ID from the request */
  workspaceIdResolver?: (request: Request) => Promise<string | undefined> | string | undefined;
  /** Optional async resolver for content item ID (e.g. from route params) */
  contentItemIdResolver?: (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<string | undefined> | string | undefined;
}

type RouteHandler = (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => Promise<Response>;

/**
 * Mark an error as already captured to prevent double-reporting.
 */
export function markCaptured(error: Error): Error {
  (error as unknown as Record<symbol, boolean>)[CAPTURED_SYMBOL] = true;
  return error;
}

/**
 * Check if an error has already been captured.
 */
export function isCaptured(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<symbol, boolean>)[CAPTURED_SYMBOL] === true
  );
}

/**
 * Wrap an async route handler with structured error capture.
 */
export function withErrorCapture(
  handler: RouteHandler,
  options: ErrorCaptureOptions,
): RouteHandler {
  return async (request: Request, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      return await handler(request, context);
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error(String(thrown));

      // Skip if already captured upstream
      if (!isCaptured(error)) {
        let userId: string | undefined;
        let workspaceId: string | undefined;
        let contentItemId: string | undefined;
        try {
          userId = await options.userIdResolver?.(request);
          workspaceId = await options.workspaceIdResolver?.(request);
          contentItemId = await options.contentItemIdResolver?.(request, context);
        } catch {
          // Don't let resolver failure mask the original error
        }

        captureRouteError(error, {
          route: options.routeName,
          feature: options.feature,
          userId,
          workspaceId,
          contentItemId,
        });

        markCaptured(error);
      }

      // Build response — include error detail in development
      const isDev = process.env.NODE_ENV === 'development';
      const correlationId =
        request.headers.get('x-correlation-id') ||
        `err_${Date.now().toString(36)}`;

      const body = {
        ok: false as const,
        error: isDev ? error.message : 'Internal server error',
        error_code: 'INTERNAL' as const,
        correlation_id: correlationId,
        ...(isDev ? { stack: error.stack } : {}),
      };

      const response = NextResponse.json(body, { status: 500 });
      response.headers.set('x-correlation-id', correlationId);
      return response;
    }
  };
}

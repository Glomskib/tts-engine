/**
 * POST /api/flashflow/issues/intake
 *
 * Open endpoint for ingesting issue reports from any source
 * (Telegram bot, Slack webhook, manual API calls, etc.).
 *
 * No auth required — designed for external integrations.
 * Deduplicates by fingerprint: if an identical issue exists, returns it
 * with `deduplicated: true` instead of inserting a duplicate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import {
  computeFingerprint,
  findByFingerprint,
  createIssue,
  logIssueAction,
} from '@/lib/flashflow/issues';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  const { source, reporter, message_text, context_json } = body;

  // Validate required fields
  if (!source || typeof source !== 'string') {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'source is required (string)',
      400,
      correlationId,
    );
  }
  if (!message_text || typeof message_text !== 'string') {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      'message_text is required (string)',
      400,
      correlationId,
    );
  }

  // Compute fingerprint and check for existing issue
  const fingerprint = computeFingerprint(source, message_text);
  const existing = await findByFingerprint(fingerprint);

  if (existing) {
    const res = NextResponse.json(
      {
        ok: true,
        deduplicated: true,
        issue: existing,
        correlation_id: correlationId,
      },
      { status: 200 },
    );
    res.headers.set('x-correlation-id', correlationId);
    return res;
  }

  // Insert new issue
  const issue = await createIssue({
    source,
    reporter: typeof reporter === 'string' ? reporter : undefined,
    message_text,
    context_json:
      context_json && typeof context_json === 'object'
        ? (context_json as Record<string, unknown>)
        : undefined,
    fingerprint,
  });

  if (!issue) {
    return createApiErrorResponse('DB_ERROR', 'Failed to create issue', 500, correlationId);
  }

  // Log the intake action (fire-and-forget)
  logIssueAction(issue.id, 'intake', {
    source,
    reporter: reporter ?? null,
    correlation_id: correlationId,
  }).catch(() => {});

  const res = NextResponse.json(
    {
      ok: true,
      deduplicated: false,
      issue,
      correlation_id: correlationId,
    },
    { status: 201 },
  );
  res.headers.set('x-correlation-id', correlationId);
  return res;
}

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

function verifyIssuesSecret(request: Request): boolean {
  const secret = process.env.FF_ISSUES_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

function makeFingerprint(source: string, message: string): string {
  return createHash('sha256')
    .update(`${source}::${message.trim().toLowerCase().slice(0, 500)}`)
    .digest('hex')
    .slice(0, 40);
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  if (!verifyIssuesSecret(request)) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid or missing FF_ISSUES_SECRET', 401, correlationId);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const source = (body.source as string) || 'api';
  const reporter = (body.reporter as string) || null;
  const messageText = body.message_text as string;
  const contextJson = (body.context as Record<string, unknown>) || {};
  const severity = (body.severity as string) || 'unknown';

  if (!messageText) {
    return createApiErrorResponse('BAD_REQUEST', 'message_text is required', 400, correlationId);
  }

  const fingerprint = makeFingerprint(source, messageText);

  // Upsert by fingerprint — if duplicate, update context and bump updated_at
  const { data: issue, error } = await supabaseAdmin
    .from('ff_issue_reports')
    .upsert(
      {
        source,
        reporter,
        message_text: messageText,
        context_json: contextJson,
        severity,
        status: 'new',
        fingerprint,
      },
      { onConflict: 'fingerprint' }
    )
    .select('id, fingerprint, status')
    .single();

  if (error) {
    console.error(`[${correlationId}] Issue intake error:`, error);
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Log intake action
  const { error: actionError } = await supabaseAdmin
    .from('ff_issue_actions')
    .insert({
      issue_id: issue.id,
      action_type: 'intake',
      payload_json: { source, reporter, correlation_id: correlationId },
    });

  if (actionError) {
    console.error(`[${correlationId}] Issue action log error (non-fatal):`, actionError);
  }

  return NextResponse.json({
    ok: true,
    issue_id: issue.id,
    fingerprint: issue.fingerprint,
    dedupe: false,
    correlation_id: correlationId,
  });
}

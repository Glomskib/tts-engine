/**
 * POST /api/admin/usage/ingest
 *
 * Accepts a batch of usage events, auto-computes cost, inserts.
 * Auth: CC_INGEST_KEY header, or admin session. Returns 501 if CC_INGEST_KEY not set and no admin session.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { UsageIngestBatchSchema } from '@/lib/command-center/validators';
import { trackUsageBatch } from '@/lib/command-center/ingest';
import { checkRateLimit } from '@/lib/command-center/rate-limiter';

export const runtime = 'nodejs';

function checkIngestKey(request: Request): boolean {
  const key = process.env.CC_INGEST_KEY;
  if (!key) return false;
  return request.headers.get('x-cc-ingest-key') === key;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  // Rate limit by source IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = checkRateLimit('usage-ingest', ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limited', retry_after_seconds: 60 }, { status: 429 });
  }

  // Allow CC_INGEST_KEY or admin auth
  const hasIngestKey = checkIngestKey(request);

  if (!hasIngestKey) {
    if (!process.env.CC_INGEST_KEY) {
      // Still allow admin auth even without CC_INGEST_KEY
      const auth = await getApiAuthContext(request);
      if (!auth.user) {
        return NextResponse.json(
          { error: 'CC_INGEST_KEY not configured and no admin session', hint: 'Set CC_INGEST_KEY env var or authenticate as admin.' },
          { status: 501 },
        );
      }
      if (!auth.isAdmin) {
        return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
      }
    } else {
      // CC_INGEST_KEY is set but header didn't match — fall back to admin auth
      const auth = await getApiAuthContext(request);
      if (!auth.user) {
        return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
      }
      if (!auth.isAdmin) {
        return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
      }
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = UsageIngestBatchSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const inserted = await trackUsageBatch(parsed.data.events);

  const response = NextResponse.json({
    ok: true,
    correlation_id: correlationId,
    inserted,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

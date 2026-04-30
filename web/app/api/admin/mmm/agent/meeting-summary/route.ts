/**
 * POST /api/admin/mmm/agent/meeting-summary
 *
 * Body: { filename?: string }  // optional — defaults to most recent note
 *
 * Reads a markdown file under web/content/meetings/mmm/, asks Miles to extract
 * decisions + action items, persists as idea_artifacts.summary. Owner-gated.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { isOwnerEmail } from '@/lib/command-center/owner-guard';
import { summarizeMeetingNote } from '@/lib/command-center/mmm/agent-loop';

const Schema = z.object({
  filename: z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9._-]+\.md$/, 'Must be a .md filename without slashes')
    .optional(),
});

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Sign in required', 401, correlationId);
  if (!isOwnerEmail(auth.user.email)) {
    return createApiErrorResponse('FORBIDDEN', 'Owner access required', 403, correlationId);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return createApiErrorResponse(
      'AI_ERROR',
      'ANTHROPIC_API_KEY is not configured.',
      503,
      correlationId,
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Allow empty body — filename is optional.
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  try {
    const result = await summarizeMeetingNote(parsed.data);
    const response = NextResponse.json({ ...result, correlation_id: correlationId }, { status: 201 });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'Summary failed',
      500,
      correlationId,
    );
  }
}

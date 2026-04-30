/**
 * POST /api/admin/mmm/approvals/reject
 *
 * Reject a pending agent-created MMM artifact. Captures rejection_reason in meta.
 *
 * Body:
 *   { kind: 'social_post' | 'task' | 'research' | 'weekly_digest' | 'meeting_summary',
 *     id: string (UUID),
 *     reason: string (required) }
 *
 * Side effects:
 *   - social_post / weekly_digest → marketing_posts.status='cancelled'
 *   - task                       → project_tasks.status='killed'
 *   - research                   → ideas.status='killed'
 *   - meeting_summary            → no row-status change; meta is updated
 *
 * Owner-gated.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { isOwnerEmail } from '@/lib/command-center/owner-guard';
import { applyApprovalDecision, APPROVAL_KINDS } from '@/lib/command-center/mmm/approvals';

const RejectSchema = z.object({
  kind: z.enum(APPROVAL_KINDS),
  id: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in required', 401, correlationId);
  }
  if (!isOwnerEmail(auth.user.email)) {
    return createApiErrorResponse('FORBIDDEN', 'Owner access required', 403, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid payload', 400, correlationId, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const result = await applyApprovalDecision({
    kind: parsed.data.kind,
    id: parsed.data.id,
    decision: 'rejected',
    reviewer_email: auth.user.email || 'unknown@local',
    rejection_reason: parsed.data.reason,
  });

  if (!result.ok) {
    return createApiErrorResponse('DB_ERROR', result.error || 'Update failed', 500, correlationId, {
      table: result.table,
    });
  }

  const response = NextResponse.json(
    {
      ok: true,
      correlation_id: correlationId,
      kind: parsed.data.kind,
      id: parsed.data.id,
      table: result.table,
      side_effects: result.side_effects,
    },
    { status: 200 },
  );
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

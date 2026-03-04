/**
 * POST /api/admin/command-center/dispatch
 *
 * Admin / OpenClaw job dispatch endpoint.
 *
 * Auth: owner-only OR service token (MISSION_CONTROL_TOKEN).
 * Execution: delegates to the canonical dispatch() pipeline in
 * lib/flashflow/agent-dispatch.ts — same path as /api/internal/agent-dispatch.
 *
 * Accepts legacy job names (e.g. "clip-discover", "ri_ingestion") and
 * maps them to canonical handler keys via JOB_ALIASES.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { dispatch } from '@/lib/flashflow/agent-dispatch';
import { HANDLERS, resolveJobType } from '@/lib/flashflow/dispatch-handlers';
import type { RunSource } from '@/lib/ops/run-source';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // ── Auth: owner or service token ───────────────────────────────────────────
  const serviceToken = process.env.MISSION_CONTROL_TOKEN;
  const authHeader = request.headers.get('authorization');
  const serviceAuth = request.headers.get('x-service-token') || request.headers.get('x-mc-token');

  const isServiceAuth = serviceToken && (
    authHeader === `Bearer ${serviceToken}` ||
    serviceAuth === serviceToken
  );

  if (!isServiceAuth) {
    const ownerCheck = await requireOwner(request);
    if (ownerCheck) return ownerCheck;
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Accept both legacy "job" and canonical "job_type"
  const rawJob = (body.job as string) || (body.job_type as string);
  if (!rawJob) {
    return NextResponse.json(
      { error: 'job or job_type (string) is required' },
      { status: 400 },
    );
  }

  const job_type = resolveJobType(rawJob);

  if (!HANDLERS[job_type]) {
    return NextResponse.json(
      { error: `Unknown job: ${rawJob}. Valid: ${Object.keys(HANDLERS).join(', ')}` },
      { status: 400 },
    );
  }

  const requested_by = (body.requested_by as string) || undefined;
  const run_source = ((body.source as string) || 'openclaw') as RunSource;
  const payload = (body.payload as Record<string, unknown>) || {};

  // Auto-generate idempotency_key if not provided (per-minute bucket)
  const idempotency_key = (body.idempotency_key as string)
    || `${job_type}:${new Date().toISOString().slice(0, 16)}`;

  // ── Dispatch via canonical pipeline ────────────────────────────────────────
  const result = await dispatch({
    job_type,
    idempotency_key,
    payload,
    requested_by,
    run_source,
  });

  // Map status to HTTP code
  let httpStatus = 200;
  if (result.status === 'error' && !result.idempotent_hit) httpStatus = 500;
  if (result.status === 'skipped') httpStatus = 409;

  return NextResponse.json(result, { status: httpStatus });
}

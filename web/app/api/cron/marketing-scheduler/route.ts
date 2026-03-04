/**
 * Cron: Marketing Scheduler (production-safe)
 *
 * Processes pending marketing posts through the Late.dev pipeline:
 *   1. Fetch posts with status='pending' + not flagged needs_review (up to 20 per run)
 *   2. Idempotency: skip if late_post_id already set (already scheduled)
 *   3. Run claim risk classifier
 *   4. Safe (score < 30) → schedule via Late API with retry + backoff → 'scheduled'
 *   5. Needs review (30-69) → flag, keep 'pending'
 *   6. Blocked (>= 70) → 'cancelled'
 *   7. Retry failed posts only if meta.retry_requested=true
 *
 * Production features:
 *   - Idempotency: late_post_id guard + status guard
 *   - Retries: 3 attempts with exponential backoff (1s, 2s, 4s)
 *   - Timeouts: 30s per Late API call (Promise.race)
 *   - Observability: marketing_runs record + ff_cron_runs heartbeat + correlation IDs
 *   - Fail-closed: marks FAILED with error detail, never hangs
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createPost, isConfigured } from '@/lib/marketing/late-service';
import { classifyClaimRisk } from '@/lib/marketing/claim-risk';
import { detectRunSourceFromRequest } from '@/lib/ops/run-source';
import { generateRunId } from '@/lib/marketing/queue';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { captureRouteError } from '@/lib/errorTracking';
import { markCaptured } from '@/lib/errors/withErrorCapture';
import type { PlatformTarget, MediaItem } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const LATE_CALL_TIMEOUT_MS = 30_000;
const LOG = '[cron/marketing-scheduler]';

// ── Error classification ─────────────────────────────────────────
type ErrorClass = 'auth' | 'validation' | 'rate_limit' | 'network' | 'timeout' | 'unknown';

function classifyError(error: string): ErrorClass {
  const lower = error.toLowerCase();
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) return 'auth';
  if (lower.includes('400') || lower.includes('422') || lower.includes('validation')) return 'validation';
  if (lower.includes('429') || lower.includes('rate')) return 'rate_limit';
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) return 'timeout';
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network') || lower.includes('fetch failed')) return 'network';
  return 'unknown';
}

function isRetryable(errClass: ErrorClass): boolean {
  return errClass === 'network' || errClass === 'timeout' || errClass === 'rate_limit' || errClass === 'unknown';
}

// ── Retry with backoff ───────────────────────────────────────────
async function createPostWithRetry(
  req: { content: string; mediaItems?: MediaItem[]; platforms: PlatformTarget[]; publishNow: boolean },
  postId: string,
  correlationId: string,
): Promise<{ ok: boolean; postId?: string; error?: string; errorClass?: ErrorClass; attempts: number }> {
  let lastError = '';
  let lastClass: ErrorClass = 'unknown';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Timeout guard
      const result = await Promise.race([
        createPost(req),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Late API call timed out')), LATE_CALL_TIMEOUT_MS),
        ),
      ]);

      if (result.ok) {
        if (attempt > 1) {
          console.log(`${LOG} [${correlationId}] Post ${postId} succeeded on attempt ${attempt}`);
        }
        return { ok: true, postId: result.postId, attempts: attempt };
      }

      lastError = result.error || 'Unknown Late error';
      lastClass = classifyError(lastError);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastClass = classifyError(lastError);
    }

    // Don't retry non-retryable errors
    if (!isRetryable(lastClass)) {
      console.warn(`${LOG} [${correlationId}] Post ${postId} non-retryable error (${lastClass}): ${lastError}`);
      return { ok: false, error: lastError, errorClass: lastClass, attempts: attempt };
    }

    // Backoff before retry (1s, 2s, 4s)
    if (attempt < MAX_RETRIES) {
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      console.log(`${LOG} [${correlationId}] Post ${postId} attempt ${attempt} failed (${lastClass}), retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { ok: false, error: lastError, errorClass: lastClass, attempts: MAX_RETRIES };
}

// ── Main handler ─────────────────────────────────────────────────
export const GET = withErrorCapture(async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'LATE_API_KEY not configured' });
  }

  const correlationId = generateRunId('mkt-sched');
  const requestId = request.headers.get('x-vercel-id') || crypto.randomUUID();
  const runSource = detectRunSourceFromRequest(request);

  console.log(`${LOG} [${correlationId}] Starting run`);

  // Insert heartbeat
  const { data: cronRun } = await supabaseAdmin
    .from('ff_cron_runs')
    .insert({
      job: 'marketing-scheduler',
      status: 'running',
      http_method: request.method,
      request_id: requestId,
      run_source: runSource,
      meta: { correlation_id: correlationId },
    })
    .select('id')
    .single();

  const heartbeatId = cronRun?.id;

  try {
    // Fetch eligible posts:
    // - status='pending' AND (meta->needs_review is null OR meta->needs_review = false)
    // - OR status='failed' AND meta->retry_requested = true
    const { data: pendingPosts, error: fetchErr } = await supabaseAdmin
      .from('marketing_posts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw new Error(`Fetch pending error: ${fetchErr.message}`);

    // Also fetch retry-requested failed posts
    const { data: retryPosts } = await supabaseAdmin
      .from('marketing_posts')
      .select('*')
      .eq('status', 'failed')
      .filter('meta->retry_requested', 'eq', 'true')
      .order('created_at', { ascending: true })
      .limit(5);

    const allPosts = [...(pendingPosts || []), ...(retryPosts || [])];

    if (allPosts.length === 0) {
      const summary = { processed: 0, correlation_id: correlationId };
      await finishRun(heartbeatId, 'ok', summary);
      return NextResponse.json({ ok: true, processed: 0, message: 'No eligible posts', correlation_id: correlationId });
    }

    let scheduled = 0;
    let blocked = 0;
    let needsReview = 0;
    let failed = 0;
    let skippedIdempotent = 0;
    const postDetails: Array<{ id: string; action: string; risk?: number; attempts?: number; error_class?: string }> = [];

    for (const post of allPosts) {
      // ── Idempotency guard: skip if already has late_post_id ──
      if (post.late_post_id && post.status !== 'failed') {
        console.log(`${LOG} [${correlationId}] Skipping ${post.id}: already has late_post_id=${post.late_post_id}`);
        skippedIdempotent++;
        postDetails.push({ id: post.id, action: 'skipped_idempotent' });
        continue;
      }

      // ── Skip needs_review posts (unless retry_requested) ──
      if (post.meta?.needs_review && !post.meta?.retry_requested) {
        postDetails.push({ id: post.id, action: 'skipped_needs_review' });
        continue;
      }

      // Clear retry flag if present
      if (post.meta?.retry_requested) {
        await supabaseAdmin.from('marketing_posts').update({
          status: 'pending',
          meta: { ...(post.meta || {}), retry_requested: false, retry_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
      }

      // ── Claim risk check ──
      const risk = classifyClaimRisk(post.content);

      await supabaseAdmin.from('marketing_posts').update({
        claim_risk_score: risk.score,
        claim_risk_flags: risk.flags,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);

      if (risk.blocked) {
        await supabaseAdmin.from('marketing_posts').update({
          status: 'cancelled',
          error: `Blocked by claim risk (score: ${risk.score}, flags: ${risk.flags.join(', ')})`,
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        blocked++;
        postDetails.push({ id: post.id, action: 'blocked', risk: risk.score });
        continue;
      }

      if (risk.needs_review) {
        await supabaseAdmin.from('marketing_posts').update({
          meta: { ...(post.meta || {}), needs_review: true, risk_flagged_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        needsReview++;
        postDetails.push({ id: post.id, action: 'needs_review', risk: risk.score });
        continue;
      }

      // ── Validate platform targets exist ──
      const platforms: PlatformTarget[] = post.platforms || [];
      if (platforms.length === 0) {
        await supabaseAdmin.from('marketing_posts').update({
          status: 'failed',
          error: 'No platform targets configured — check marketing_brand_accounts table',
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        failed++;
        postDetails.push({ id: post.id, action: 'failed', error_class: 'validation' });
        continue;
      }

      // ── Schedule via Late with retry ──
      const mediaItems: MediaItem[] = post.media_items || [];

      const result = await createPostWithRetry(
        {
          content: post.content,
          mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
          platforms,
          publishNow: false,
        },
        post.id,
        correlationId,
      );

      if (result.ok) {
        await supabaseAdmin.from('marketing_posts').update({
          status: 'scheduled',
          late_post_id: result.postId,
          error: null,
          meta: { ...(post.meta || {}), scheduled_at: new Date().toISOString(), attempts: result.attempts },
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        scheduled++;
        postDetails.push({ id: post.id, action: 'scheduled', risk: risk.score, attempts: result.attempts });
      } else {
        await supabaseAdmin.from('marketing_posts').update({
          status: 'failed',
          error: `[${result.errorClass}] ${result.error} (${result.attempts} attempts)`,
          meta: { ...(post.meta || {}), last_error_class: result.errorClass, attempts: result.attempts, failed_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        failed++;
        postDetails.push({ id: post.id, action: 'failed', risk: risk.score, attempts: result.attempts, error_class: result.errorClass });
      }
    }

    const summary = {
      processed: allPosts.length,
      scheduled,
      blocked,
      needsReview,
      failed,
      skippedIdempotent,
      correlation_id: correlationId,
      post_details: postDetails,
    };

    console.log(`${LOG} [${correlationId}] Complete: ${JSON.stringify({ ...summary, post_details: undefined })}`);

    // Log to marketing_runs
    await supabaseAdmin.from('marketing_runs').insert({
      job: 'marketing-scheduler',
      status: failed > 0 ? 'error' : 'ok',
      posts_created: scheduled,
      posts_failed: failed,
      finished_at: new Date().toISOString(),
      meta: summary,
    });

    await finishRun(heartbeatId, 'ok', summary);

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    captureRouteError(error, {
      route: '/api/cron/marketing-scheduler',
      feature: 'marketing',
      runId: correlationId,
    });
    markCaptured(error);
    console.error(`${LOG} [${correlationId}] Fatal:`, err);
    await finishRun(heartbeatId, 'error', undefined, String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}, { routeName: '/api/cron/marketing-scheduler', feature: 'marketing' });

async function finishRun(
  heartbeatId: string | undefined,
  status: 'ok' | 'error',
  meta?: Record<string, unknown>,
  error?: string,
) {
  if (!heartbeatId) return;
  await supabaseAdmin.from('ff_cron_runs').update({
    status,
    finished_at: new Date().toISOString(),
    ...(meta ? { meta } : {}),
    ...(error ? { error } : {}),
  }).eq('id', heartbeatId);
}

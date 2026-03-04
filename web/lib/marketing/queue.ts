/**
 * Marketing Queue — Insert drafts into marketing_posts as PENDING rows.
 *
 * This is the ONLY path for drafts to enter the scheduling pipeline.
 * The marketing-scheduler cron picks up PENDING rows and schedules via Late.
 *
 * Flow: Draft generation → queue.enqueue() → marketing_posts (PENDING)
 *       → cron/marketing-scheduler → Late API → SCHEDULED/PUBLISHED
 */

import { resolveTargets } from './brand-accounts';
import { classifyClaimRisk } from './claim-risk';
import type { LatePlatform, PlatformTarget, PostStatus } from './types';

const LOG_PREFIX = '[marketing:queue]';

export interface EnqueueDraft {
  content: string;
  platform?: string;
  brand: string;
  source: string;
  run_id?: string;
  platforms?: LatePlatform[];
  meta?: Record<string, unknown>;
}

export interface EnqueueResult {
  ok: boolean;
  post_id?: string;
  claim_risk_score?: number;
  error?: string;
}

export interface EnqueueBatchResult {
  ok: boolean;
  queued: number;
  skipped: number;
  errors: string[];
  post_ids: string[];
  run_id: string;
}

/**
 * Generate a correlation run_id for tracing across generation → queue → schedule.
 */
export function generateRunId(source: string): string {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${source}-${ts}-${rand}`;
}

/**
 * Enqueue a single draft into marketing_posts.
 * Does NOT call Late — only inserts a row for the scheduler.
 */
export async function enqueue(draft: EnqueueDraft): Promise<EnqueueResult> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');

    // Resolve brand → platform targets
    const targets: PlatformTarget[] = draft.platforms
      ? await resolveTargets(draft.brand, draft.platforms)
      : await resolveTargets(draft.brand);

    if (targets.length === 0) {
      return { ok: false, error: `No targets resolved for brand="${draft.brand}"` };
    }

    // Run claim risk
    const risk = classifyClaimRisk(draft.content);

    // Determine initial status
    let status: PostStatus = 'pending';
    if (risk.blocked) {
      status = 'cancelled';
    }

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .insert({
        content: draft.content,
        media_items: [],
        platforms: targets,
        status,
        source: draft.source,
        claim_risk_score: risk.score,
        claim_risk_flags: risk.flags,
        created_by: draft.source,
        meta: {
          ...(draft.meta || {}),
          run_id: draft.run_id,
          brand: draft.brand,
          source_platform: draft.platform,
          draft: true,
          needs_review: risk.needs_review,
          ...(risk.blocked ? { blocked_reason: `Claim risk ${risk.score}: ${risk.flags.join(', ')}` } : {}),
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} Insert error:`, error.message);
      return { ok: false, error: error.message };
    }

    const postId = data?.id;
    console.log(
      `${LOG_PREFIX} Queued post ${postId} [${status}] brand="${draft.brand}" risk=${risk.score} run_id=${draft.run_id || 'none'}`,
    );

    return { ok: true, post_id: postId, claim_risk_score: risk.score };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} enqueue error:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Enqueue a batch of drafts. Used by daily-intel pipeline and agents.
 * Returns aggregate result with correlation run_id.
 */
export async function enqueueBatch(
  drafts: Array<{ platform: string; content: string }>,
  opts: {
    brand: string;
    source: string;
    run_id?: string;
    platforms?: LatePlatform[];
  },
): Promise<EnqueueBatchResult> {
  const runId = opts.run_id || generateRunId(opts.source);

  if (drafts.length === 0) {
    return { ok: true, queued: 0, skipped: 0, errors: [], post_ids: [], run_id: runId };
  }

  const errors: string[] = [];
  const postIds: string[] = [];
  let skipped = 0;

  for (const draft of drafts) {
    const result = await enqueue({
      content: draft.content,
      platform: draft.platform,
      brand: opts.brand,
      source: opts.source,
      run_id: runId,
      platforms: opts.platforms,
      meta: { original_platform_hint: draft.platform },
    });

    if (result.ok && result.post_id) {
      postIds.push(result.post_id);
    } else if (result.error) {
      errors.push(`${draft.platform}: ${result.error}`);
    } else {
      skipped++;
    }
  }

  console.log(
    `${LOG_PREFIX} Batch complete: ${postIds.length} queued, ${skipped} skipped, ${errors.length} errors [run_id=${runId}]`,
  );

  return {
    ok: errors.length === 0,
    queued: postIds.length,
    skipped,
    errors,
    post_ids: postIds,
    run_id: runId,
  };
}

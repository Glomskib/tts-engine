/**
 * Revenue Intelligence – Auto-Draft Service
 *
 * Selectively generates reply drafts for high-scoring comments
 * (leadScore >= threshold) and marks them with needs_review=true,
 * source='ri' so they surface in the Revenue Mode UI for review.
 *
 * Gated behind RI_AUTO_DRAFT=true. Rate-limited by RI_AUTO_DRAFT_MAX.
 * Individual draft failures are logged but never fail the ingestion run.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateReplyDrafts } from './reply-draft-service';
import { checkHourlyCap } from '@/lib/ops/cost-caps';

const TAG = '[ri:auto-draft]';

export interface AutoDraftConfig {
  leadScoreMin: number; // default 70
  maxPerRun: number;    // default 10
}

export interface AutoDraftResult {
  qualified: number;
  generated: number;
  errors: string[];
}

/** Load auto-draft config from env. */
export function loadAutoDraftConfig(): AutoDraftConfig {
  const leadScoreMin = parseInt(process.env.RI_AUTO_DRAFT_MIN_SCORE ?? '70', 10);
  const maxPerRun = parseInt(process.env.RI_AUTO_DRAFT_MAX ?? '10', 10);
  return {
    leadScoreMin: Number.isFinite(leadScoreMin) && leadScoreMin > 0 ? leadScoreMin : 70,
    maxPerRun: Number.isFinite(maxPerRun) && maxPerRun > 0 ? maxPerRun : 10,
  };
}

/** Check whether auto-draft is enabled. */
export function isAutoDraftEnabled(): boolean {
  return process.env.RI_AUTO_DRAFT === 'true';
}

/**
 * Run auto-drafts for a set of just-classified comment IDs.
 *
 * 1. Query ri_comment_analysis for items with lead_score >= threshold
 * 2. Cap at maxPerRun
 * 3. Generate drafts via existing generateReplyDrafts (idempotent)
 * 4. Mark resulting draft rows with needs_review=true, source='ri'
 */
export async function runAutoDrafts(
  commentIds: string[],
  config: AutoDraftConfig,
): Promise<AutoDraftResult> {
  const errors: string[] = [];

  if (commentIds.length === 0) {
    return { qualified: 0, generated: 0, errors };
  }

  // 0. Check hourly cap
  const cap = await checkHourlyCap();
  if (!cap.allowed) {
    console.log(`${TAG} Hourly cap reached (${cap.current}/${cap.limit}). Skipping auto-drafts.`);
    return { qualified: 0, generated: 0, errors: ['hourly_cap_reached'] };
  }

  // Reduce effective max if remaining is less than config
  const effectiveMaxPerRun = Math.min(config.maxPerRun, cap.remaining);

  // 1. Find high-scoring comments from this batch
  let qualifiedIds: string[];
  try {
    const { data: analyses, error } = await supabaseAdmin
      .from('ri_comment_analysis')
      .select('comment_id')
      .in('comment_id', commentIds)
      .gte('lead_score', config.leadScoreMin);

    if (error) {
      errors.push(`Analysis query failed: ${error.message}`);
      return { qualified: 0, generated: 0, errors };
    }

    qualifiedIds = (analyses ?? []).map((a) => a.comment_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Analysis query error: ${msg}`);
    return { qualified: 0, generated: 0, errors };
  }

  if (qualifiedIds.length === 0) {
    console.log(`${TAG} No comments met lead_score >= ${config.leadScoreMin}`);
    return { qualified: 0, generated: 0, errors };
  }

  // 2. Cap at effectiveMaxPerRun (min of config.maxPerRun and hourly cap remaining)
  const capped = qualifiedIds.slice(0, effectiveMaxPerRun);
  console.log(`${TAG} ${qualifiedIds.length} qualified, processing ${capped.length} (max ${effectiveMaxPerRun}, cap ${cap.remaining}/${cap.limit})`);

  // 3. Generate drafts (idempotent — skips comments that already have drafts)
  let generated = 0;
  try {
    const result = await generateReplyDrafts(capped);
    generated = result.generated;
    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Draft generation failed: ${msg}`);
    console.error(`${TAG} Draft generation error:`, msg);
    // Don't return — try to mark any existing drafts
  }

  // 4. Mark draft rows for these comments as needs_review + source='ri'
  try {
    const { error: updateError } = await supabaseAdmin
      .from('ri_reply_drafts')
      .update({ needs_review: true, source: 'ri' })
      .in('comment_id', capped);

    if (updateError) {
      errors.push(`Failed to mark drafts: ${updateError.message}`);
      console.error(`${TAG} Mark drafts error:`, updateError.message);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Mark drafts error: ${msg}`);
    console.error(`${TAG} Mark drafts error:`, msg);
  }

  console.log(`${TAG} Auto-drafted ${generated} rows for ${capped.length} comments`);
  return { qualified: qualifiedIds.length, generated, errors };
}

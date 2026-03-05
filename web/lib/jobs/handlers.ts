/**
 * Job Queue — Handler Registry
 *
 * Maps job types to their handler functions.
 */

import type { Job, JobHandler, JobType } from './types';
import { detectWinners } from '@/lib/content-intelligence/winners';
import { analyzeAndStoreSuggestions } from '@/lib/editing/analyzeTranscript';
import { replicatePattern } from '@/lib/content-intelligence/replicatePattern';

const handlers: Record<JobType, JobHandler> = {
  detect_winners: async (job: Job) => {
    const daysBack = (job.payload.days_back as number) || 30;
    const result = await detectWinners(job.workspace_id, { daysBack });
    return result as unknown as Record<string, unknown>;
  },

  analyze_transcript: async (job: Job) => {
    const contentItemId = job.payload.content_item_id as string;
    if (!contentItemId) throw new Error('content_item_id required');
    const result = await analyzeAndStoreSuggestions(contentItemId, job.workspace_id);
    return { suggestions_count: result.suggestions.length, stored: result.stored };
  },

  generate_script: async (job: Job) => {
    // Placeholder — script generation is handled synchronously via the generate-skit API
    // This handler exists for future async script generation
    return { status: 'not_implemented', payload: job.payload };
  },

  refresh_metrics: async (job: Job) => {
    // Placeholder — metrics refresh is handled by the metrics-sync cron
    // This handler exists for on-demand single-workspace refresh
    return { status: 'not_implemented', workspace_id: job.workspace_id };
  },

  replicate_pattern: async (job: Job) => {
    const patternId = job.payload.pattern_id as string;
    const count = (job.payload.count as number) || 5;
    if (!patternId) throw new Error('pattern_id required');
    const result = await replicatePattern(job.workspace_id, patternId, count);
    return result as unknown as Record<string, unknown>;
  },
};

export function getHandler(type: JobType): JobHandler | undefined {
  return handlers[type];
}

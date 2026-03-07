/**
 * Creator stage heuristic — computed label, never stored.
 *
 * Used for:
 *   - Dashboard header badge
 *   - Selecting sensible UI defaults
 *
 * Evaluation order matters: Advanced > Scaling > Builder > Starter.
 */

import type { CreatorProfile } from './schema';

export type CreatorStage = 'Starter' | 'Builder' | 'Scaling' | 'Advanced';

export interface CreatorStageResult {
  stage: CreatorStage;
  color: string;       // Tailwind text color class
  bg: string;          // Tailwind bg class
  description: string;
}

const STAGE_META: Record<CreatorStage, Omit<CreatorStageResult, 'stage'>> = {
  Starter: {
    color: 'text-zinc-400',
    bg: 'bg-zinc-800',
    description: 'Just getting started with TikTok Shop',
  },
  Builder: {
    color: 'text-blue-400',
    bg: 'bg-blue-900/40',
    description: 'Building a consistent posting routine',
  },
  Scaling: {
    color: 'text-teal-400',
    bg: 'bg-teal-900/40',
    description: 'Scaling output and testing at volume',
  },
  Advanced: {
    color: 'text-violet-400',
    bg: 'bg-violet-900/40',
    description: 'High-GMV creator or large team operation',
  },
};

export function computeCreatorStage(profile: Partial<CreatorProfile> | null): CreatorStageResult {
  if (!profile) {
    const s = 'Starter';
    return { stage: s, ...STAGE_META[s] };
  }

  const { tts_affiliate_tenure, current_videos_per_day, monthly_gmv_bucket, team_mode } = profile;

  // Advanced: high GMV or large team
  if (
    monthly_gmv_bucket === '20_100k' ||
    monthly_gmv_bucket === '100k_plus' ||
    team_mode === 'team_6_plus'
  ) {
    const s = 'Advanced';
    return { stage: s, ...STAGE_META[s] };
  }

  // Scaling: high volume or non-solo team
  const highVolume = ['11_20', '21_30', '31_50', '50_plus'].includes(current_videos_per_day ?? '');
  const nonSolo = team_mode !== undefined && team_mode !== null && team_mode !== 'solo';
  if (highVolume || nonSolo) {
    const s = 'Scaling';
    return { stage: s, ...STAGE_META[s] };
  }

  // Starter: not on TikTok Shop or not posting
  const starterTenure = ['not_started', '0_1m'].includes(tts_affiliate_tenure ?? '');
  const notPosting = current_videos_per_day === 'not_posting';
  if (starterTenure || notPosting) {
    const s = 'Starter';
    return { stage: s, ...STAGE_META[s] };
  }

  // Builder: low-to-moderate volume, low/no GMV
  const lowVolume = ['1', '2_3', '4_10'].includes(current_videos_per_day ?? '');
  const lowGmv = !monthly_gmv_bucket || ['0', 'lt_1k'].includes(monthly_gmv_bucket);
  if (lowVolume && lowGmv) {
    const s = 'Builder';
    return { stage: s, ...STAGE_META[s] };
  }

  // Default to Builder for partial profiles
  const s = 'Builder';
  return { stage: s, ...STAGE_META[s] };
}

/**
 * Campaign Generation Types
 *
 * Campaigns reuse the experiments table. The campaign_config JSONB column
 * stores generation parameters and progress.
 */

export interface CampaignConfig {
  /** Number of hooks to generate per persona×angle combination */
  hooks_per_combo: number;
  /** Persona IDs from lib/personas.ts */
  persona_ids: string[];
  /** Content angles / themes to explore */
  angles: string[];
  /** Target platform */
  platform: 'tiktok' | 'instagram_reels' | 'youtube_shorts';
  /** Tone override (optional) */
  tone?: string;
  /** CTA style */
  cta_style?: string;
  /** Whether to auto-generate scripts after hooks */
  auto_script: boolean;
  /** Whether to create content_items from generated scripts */
  auto_content_items: boolean;
  /** Generation status tracking */
  generation_status: 'pending' | 'generating_hooks' | 'generating_scripts' | 'creating_items' | 'completed' | 'failed' | 'partial';
  /** Detailed progress */
  generation_progress: {
    hooks_requested: number;
    hooks_generated: number;
    scripts_requested: number;
    scripts_generated: number;
    items_created: number;
    errors: string[];
    started_at?: string;
    completed_at?: string;
  };
}

export interface CampaignGenerateRequest {
  /** Experiment name */
  name: string;
  /** Brand ID */
  brand_id: string;
  /** Product ID */
  product_id: string;
  /** Goal / hypothesis */
  goal?: string;
  /** Number of hooks per persona×angle combo */
  hooks_per_combo: number;
  /** Persona IDs */
  persona_ids: string[];
  /** Angles to test */
  angles: string[];
  /** Platform */
  platform: 'tiktok' | 'instagram_reels' | 'youtube_shorts';
  /** Tone */
  tone?: string;
  /** CTA style */
  cta_style?: string;
  /** Auto-generate scripts */
  auto_script: boolean;
  /** Auto-create content items */
  auto_content_items: boolean;
}

/** Matrix cell: one combination to generate */
export interface CampaignMatrixCell {
  persona_id: string;
  persona_name: string;
  angle: string;
  hook_count: number;
}

export interface CampaignGenerateResponse {
  ok: boolean;
  experiment_id: string;
  matrix: CampaignMatrixCell[];
  total_hooks: number;
  total_scripts: number;
  total_items: number;
  errors: string[];
}

export const MAX_MATRIX_SIZE = 50;
export const MAX_HOOKS_PER_COMBO = 5;
export const MAX_PERSONAS = 5;
export const MAX_ANGLES = 5;

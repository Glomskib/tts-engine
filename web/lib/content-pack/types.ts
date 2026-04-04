/**
 * Content Pack types — a bundled creative starting pack for one idea.
 */

export type PackSourceType = 'opportunity' | 'product' | 'topic' | 'transcript' | 'comment' | 'blank' | 'remix';

export interface ContentPackInput {
  /** What kind of source triggered this pack */
  source_type: PackSourceType;
  /** The topic or product name */
  topic: string;
  /** Optional product ID (if from product catalog) */
  product_id?: string;
  /** Optional verbal hook seed (from opportunity, comment, etc.) */
  seed_hook?: string;
  /** Optional inspiration/context text */
  context?: string;
  /** Optional platform */
  platform?: 'tiktok' | 'youtube_shorts' | 'instagram_reels';
  /** Optional niche */
  niche?: string;
  /** Optional vibe analysis for style-matching */
  vibe?: {
    delivery_style?: string;
    pacing_style?: string;
    hook_energy?: string;
    visual_style?: string;
    visual_rhythm?: string;
    reveal_timing?: string;
    recreate_guidance?: string[];
    timing_arc?: {
      hook_ends_at: number;
      explanation_ends_at: number;
      proof_reveal_at: number;
      cta_starts_at: number;
    };
  };
}

export interface PackHook {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  why_this_works: string;
  category: string;
}

export interface PackScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  full_script: string;
  on_screen_text: string[];
  filming_notes: string;
  caption: string;
  hashtags: string[];
  persona: string;
  sales_approach: string;
  structure_used?: string;
  estimated_length: string;
}

export interface PackVisualHook {
  action: string;
  shot_type: string;
  setup: string;
  pairs_with?: string;
  energy: string;
  why_it_works: string;
  strength?: number;
}

export interface ContentPack {
  id: string;
  user_id: string;
  source_type: PackSourceType;
  topic: string;
  hooks: PackHook[];
  script: PackScript | null;
  visual_hooks: PackVisualHook[];
  /** Caption/title variants derived from the script */
  title_variants: string[];
  /** Metadata about what was used */
  meta: {
    platform: string;
    niche?: string;
    persona_used?: string;
    structure_used?: string;
    vibe_used: boolean;
    seed_hook?: string;
    context?: string;
  };
  /** Generation status per component */
  status: {
    hooks: 'ok' | 'failed' | 'skipped';
    script: 'ok' | 'failed' | 'skipped';
    visual_hooks: 'ok' | 'failed' | 'skipped';
  };
  created_at: string;
  /** Whether the user has favorited this pack */
  favorited?: boolean;
  /** Optional user note */
  notes?: string;
  /** Last updated (e.g. after regeneration) */
  updated_at?: string;
}

/**
 * Visual Hook types — filmable first-shot ideas for short-form video.
 */

export interface VisualHookIdea {
  /** Specific, filmable action for the first 1-3 seconds */
  action: string;
  /** Camera/framing type */
  shot_type: 'close-up' | 'wide' | 'pov' | 'overhead' | 'split-screen' | 'screen-record' | 'text-first';
  /** What you need to film this (props, location, setup) */
  setup: string;
  /** Optional verbal hook that pairs well */
  pairs_with?: string;
  /** Energy/vibe of the opening */
  energy: 'calm' | 'punchy' | 'dramatic' | 'comedic' | 'mysterious';
  /** Why this opening grabs attention */
  why_it_works: string;
  /** Strength score 0-100 (heuristic, higher = stronger idea) */
  strength?: number;
  /** Saved ID if this idea has been bookmarked */
  saved_id?: string;
}

export interface VibeContext {
  delivery_style?: string;
  pacing_style?: string;
  hook_energy?: string;
  visual_style?: string;
  visual_rhythm?: string;
  cta_tone?: string;
  reveal_timing?: string;
  recreate_guidance?: string[];
  timing_arc?: {
    hook_ends_at: number;
    explanation_ends_at: number;
    proof_reveal_at: number;
    cta_starts_at: number;
  };
}

export interface VisualHookRequest {
  /** Product or topic */
  topic: string;
  /** Optional platform context */
  platform?: 'tiktok' | 'youtube_shorts' | 'instagram_reels';
  /** Optional existing verbal hook to pair with */
  verbal_hook?: string;
  /** Optional script context (what the video is about) */
  script_context?: string;
  /** Optional niche */
  niche?: string;
  /** Optional vibe analysis for style-matching */
  vibe?: VibeContext;
  /** Number of ideas to generate (default 6) */
  count?: number;
}

export interface VisualHookResponse {
  ideas: VisualHookIdea[];
}

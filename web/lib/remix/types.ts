/**
 * Remix Types
 *
 * Context model and result types for the "Remix This Video" feature.
 * Built from existing transcriber + vibe analysis output.
 */

import type { PackHook, PackVisualHook } from '@/lib/content-pack/types';

// ── Remix Context (built from transcribe + vibe analysis) ──

export interface RemixContext {
  /** Original video URL */
  source_url: string;
  /** Detected platform */
  platform: 'tiktok' | 'youtube';
  /** Full transcript */
  transcript: string;
  /** Video duration in seconds */
  duration: number;

  /** Original hook analysis */
  original_hook: {
    line: string;
    style: string;
    strength: number;
  };

  /** Content structure */
  content: {
    format: string;
    pacing: string;
    structure: string;
  };

  /** Key phrases from original */
  key_phrases: string[];
  /** Emotional triggers identified */
  emotional_triggers: string[];
  /** Why the original works */
  what_works: string[];
  /** Primary emotion */
  target_emotion: string;

  /** Vibe analysis (if available) */
  vibe?: {
    delivery_style: string;
    pacing_style: string;
    hook_energy: string;
    visual_style: string;
    visual_rhythm: string;
    cta_tone: string;
    reveal_timing: string;
    recreate_guidance: string[];
    timing_arc?: {
      hook_ends_at: number;
      explanation_ends_at: number;
      proof_reveal_at: number;
      cta_starts_at: number;
    };
  };
}

// ── Remix Script ──

export interface RemixScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  full_script: string;
  on_screen_text: string[];
  filming_notes: string;
  estimated_length: string;
  /** What changed from the original */
  remix_notes: string;
}

// ── Remix Result (returned by /api/remix/generate) ──

export interface RemixResult {
  /** The remix script */
  script: RemixScript | null;
  /** Hooks the creator can try */
  hooks: PackHook[];
  /** Visual hook ideas */
  visual_hooks: PackVisualHook[];
  /** Why the original works — human-readable analysis */
  why_it_works: string[];
  /** Generation status per component */
  status: {
    script: 'ok' | 'failed';
    hooks: 'ok' | 'failed';
    visual_hooks: 'ok' | 'failed';
  };
}

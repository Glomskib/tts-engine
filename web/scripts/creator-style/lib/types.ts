/**
 * Shared types for the creator-style fingerprinting CLI pipeline.
 */

// ── Config ──

export interface IngestConfig {
  creatorKey: string;
  urlsFile: string;
  limit: number;
  headless: boolean;
}

export interface BuildConfig {
  creatorKey: string;
  minSamples: number;
}

// ── Data ──

export interface Screenshot {
  timestamp_label: string; // 'opening' | 'mid' | 'end'
  base64_jpeg: string;
  description?: string;
}

export interface HookAnalysis {
  type: string;
  template: string;
  word_count: number;
}

export interface SampleAnalysis {
  hook_pattern: {
    type: string;
    avg_word_count: number;
    template: string;
    examples_abstracted: string[];
  };
  structure_pattern: {
    format: string;
    flow: string;
    avg_duration_seconds: number;
    pacing: string;
  };
  voice_patterns: {
    tone: string;
    person: string;
    transition_phrases: string[];
    filler_patterns: string[];
    signature_cadence: string;
  };
  cta_pattern: {
    style: string;
    placement: string;
    template: string;
  };
  content_dna: {
    niche_signals: string[];
    emotional_range: string[];
    audience_relationship: string;
    unique_angle: string;
  };
  visual_patterns?: {
    primary_settings: string[];
    lighting_style: string;
    camera_style: string;
    text_overlay_usage: string;
    production_level: string;
  };
}

export interface CreatorFingerprint {
  creator_key: string;
  summary: string;
  hook_patterns: string[];
  structure_rules: string[];
  banned_phrases: string[];
  do_list: string[];
  dont_list: string[];
  samples_count: number;
  version: number;
}

// ── Results ──

export interface IngestResult {
  total_urls: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface BuildResult {
  creator_key: string;
  samples_used: number;
  fingerprint: CreatorFingerprint;
  mc_doc_id?: string;
}

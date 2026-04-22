/**
 * Video Engine V1 — shared types.
 *
 * Mode is the single top-level abstraction that swaps scoring weights,
 * template registry, and CTA registry without forking the pipeline.
 */

export type Mode = 'affiliate' | 'nonprofit' | 'clipper';

export const MODES: Mode[] = ['affiliate', 'nonprofit', 'clipper'];

export type RunStatus =
  | 'created'
  | 'transcribing'
  | 'analyzing'
  | 'assembling'
  | 'rendering'
  | 'complete'
  | 'failed';

export type RenderedClipStatus = 'queued' | 'rendering' | 'complete' | 'failed';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Per-chunk deterministic feature scores in [0..1]. Mode-agnostic — the mode
 * decides how to weight these into a final score, never which features exist.
 */
export interface ChunkFeatures {
  hookStrength: number;          // curiosity/opener words at start
  productMention: number;        // brand/product/url tokens (affiliate)
  emotionalIntensity: number;    // emotion vocabulary
  benefitStatement: number;      // "you'll", "you can", "saves you"
  ctaLikelihood: number;         // imperative verbs / direct asks
  retentionPotential: number;    // numbers, proper nouns, specificity
  testimonialPhrase: number;     // "changed my life", "for the first time"
  groupLanguage: number;         // "we", "everyone", "together", "community"
  scenicLanguage: number;        // outdoor/imagery vocabulary
  celebrationLanguage: number;   // "we did it", "finished", "proud"
  durationFit: number;           // sweet-spot 6-30s
  specificity: number;           // proper nouns / numbers density
}

export interface ChunkInput {
  idx: number;
  start: number;
  end: number;
  text: string;
  features: ChunkFeatures;
}

export interface CandidateOutput {
  start: number;
  end: number;
  text: string;
  hookText: string | null;
  clipType: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  sourceChunkIdxs: number[];
}

/**
 * A render template knows how to take one selected candidate (a span of source
 * footage with an associated chunk of transcript) and produce a Shotstack-shape
 * timeline. Templates are mode-scoped via the registry.
 */
export interface RenderTemplate {
  key: string;             // e.g. 'aff_tiktok_shop'
  mode: Mode;
  name: string;
  description: string;
  pacing: 'fast' | 'medium' | 'slow';
  captionTone: 'bold' | 'emotional' | 'informational' | 'casual';
  defaultCTAKey: string;
  build(input: TemplateBuildInput): ShotstackTimeline;
}

export interface TemplateBuildInput {
  candidate: {
    start: number;
    end: number;
    text: string;
    hookText: string | null;
    clipType: string;
  };
  asset: {
    storage_url: string;
    duration_sec: number;
    width?: number | null;
    height?: number | null;
  };
  context: Record<string, unknown>;   // run.context_json
  ctaKey: string;
  ctaText: string;
}

/**
 * Shotstack-shape timeline. Kept loose because we hand it to the existing
 * `renderVideo()` client unchanged.
 */
export interface ShotstackTimeline {
  background?: string;
  tracks: Array<{
    clips: Array<Record<string, unknown>>;
  }>;
}

export interface CTA {
  key: string;
  mode: Mode;
  label: string;             // user-facing button text
  overlayText: string;       // burned-in card text
  subtitle?: string;
  accentColor: string;       // hex
}

export interface ModeConfig {
  key: Mode;
  label: string;
  description: string;
  scoreWeights: Record<keyof ChunkFeatures, number>;
  /** Templates considered when the user does not pin a specific preset. */
  defaultTemplateKeys: string[];
  /** Default CTA when a template doesn't override. */
  defaultCTAKey: string;
}

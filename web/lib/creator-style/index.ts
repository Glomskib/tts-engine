/**
 * Creator Style Fingerprinting — barrel exports.
 */

export { getTranscript, detectPlatform } from './transcript-adapter';
export type { TranscriptResult, TranscriptSegment } from './transcript-adapter';

export { extractFrames } from './frame-extractor';
export type { ExtractedFrame } from './frame-extractor';

export { analyzeVisuals, analyzeStyle } from './ai-analysis';
export type { VisualObservation, StyleAnalysis } from './ai-analysis';

export { buildStylePack } from './style-pack';
export type { StylePack } from './style-pack';

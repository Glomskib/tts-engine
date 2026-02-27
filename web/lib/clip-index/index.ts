/**
 * Overlay Clip Index — Module barrel export
 */
export { getClipRules, parseRulesMarkdown } from './rules-parser';
export type { ClipRules, Ingredient, ProductTypeMapping, PublishThresholds } from './rules-parser';

export { runDiscovery } from './discovery';
export type { DiscoveryResult } from './discovery';

export { fetchClipTranscript } from './transcript';
export type { TranscriptResult } from './transcript';

export { scoreCandidate, isHardReject } from './scoring';
export type { ScoringInput, ScoringResult, BestMoment } from './scoring';

export { runAnalysis } from './analyze';
export type { AnalyzeResult } from './analyze';

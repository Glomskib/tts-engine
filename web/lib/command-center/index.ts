/**
 * Command Center – public API surface.
 *
 * Usage from other parts of the app:
 *   import { trackUsage, logTaskEvent, saveIdeaArtifact } from '@/lib/command-center';
 *   import { recordAgentRunStart, recordAgentRunFinish } from '@/lib/command-center/agent-runs';
 */
export { trackUsage, trackUsageBatch, logTaskEvent, saveIdeaArtifact } from './ingest';
export type { TrackUsageParams, LogTaskEventParams, SaveArtifactParams } from './ingest';
export { recordAgentRunStart, recordAgentRunFinish } from './agent-runs';
export type { AgentRunStartParams, AgentRunFinishParams } from './agent-runs';
export { requireOwner, checkIsOwner, isOwnerEmail } from './owner-guard';
export { computeCost, hasPricing, getAllPricing } from '@/lib/llm-pricing';
export { ingestUsageEvent, ingestAgentRunStart, ingestAgentRunFinish } from './openclaw-adapter';

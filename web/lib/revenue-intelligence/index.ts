/**
 * Revenue Intelligence – Module Barrel Export
 *
 * Single entry point for all Revenue Intelligence services.
 */

// Types
export * from './types';

// Services
export {
  getActiveCreatorAccounts,
  upsertVideo,
  insertComments,
  createCommentStatuses,
  getUnprocessedComments,
  markCommentsProcessed,
  runIngestionForAccount,
} from './comment-ingestion-service';

export { classifyComments } from './comment-classification-service';

export { generateReplyDrafts } from './reply-draft-service';

export {
  flagUrgentComments,
  sendUrgentAlerts,
} from './urgency-scoring-service';

export {
  getInboxComments,
  updateCommentStatus,
  getInboxStats,
} from './revenue-inbox-service';

export type { InboxStats } from './revenue-inbox-service';

// Simulation filter
export {
  isSimulationComment,
  isSimulationVideo,
  SIM_COMMENT_PATTERN,
  SIM_VIDEO_PATTERN,
} from './simulation-filter';

// Logger
export { logAgentAction, logAndTime } from './agent-logger';

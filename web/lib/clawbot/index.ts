export type {
  StrategyRequest,
  StrategyResponse,
  PerformanceData,
  FeedbackInput,
  FeedbackSummary,
  WinnerPattern,
  ClawbotGenerateRequest,
  ClawbotGenerateResponse,
} from "./types";

export {
  generateStrategy,
  fetchWinnerPatternsForStrategy,
  fetchRecentFeedback,
  recordFeedback,
} from "./client";

export { buildStrategyPrompt } from "./prompt";

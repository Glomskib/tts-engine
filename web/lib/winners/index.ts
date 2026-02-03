/**
 * Winners Bank Module
 *
 * Unified exports for the winners system
 */

// Types
export * from './types';

// API functions
export {
  fetchWinners,
  fetchWinnerById,
  createWinner,
  updateWinner,
  deleteWinner,
  fetchWinnerPatterns,
  fetchWinnersIntelligence,
  updateWinnerAnalysis,
} from './api';

// Context building for prompts
export {
  buildWinnersContext,
  buildWinnerVariationPrompt,
  summarizeWinners,
} from './context';

// AI Intelligence
export {
  buildAnalysisPrompt,
  analyzeWinnerWithAI,
  extractPatternsFromAnalysis,
} from './intelligence';

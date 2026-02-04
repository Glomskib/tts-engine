/**
 * Winners Bank Types
 *
 * Unified type definitions for the winners system.
 * Field names match the actual winners_bank table columns.
 */

// Source types for winners
export type WinnerSourceType = 'generated' | 'external';

// Hook types for categorization
export type HookType =
  | 'question'
  | 'bold_statement'
  | 'pov'
  | 'curiosity_gap'
  | 'controversy'
  | 'relatable'
  | 'shock'
  | 'story'
  | 'list'
  | 'challenge';

// Content format types
export type ContentFormat =
  | 'skit'
  | 'story'
  | 'tutorial'
  | 'review'
  | 'comparison'
  | 'transformation'
  | 'day_in_life'
  | 'grwm'
  | 'unboxing'
  | 'trend';

/**
 * Winner record from winners_bank table
 *
 * Columns: id, user_id, source_type, script_id,
 *   hook, full_script, video_url, thumbnail_url, notes,
 *   hook_type, content_format, product_category,
 *   view_count, like_count, comment_count, share_count, save_count,
 *   engagement_rate, retention_1s, retention_3s, retention_5s, retention_10s, avg_watch_time,
 *   ai_analysis, patterns, performance_score,
 *   posted_at, created_at, updated_at
 */
export interface Winner {
  id: string;
  user_id: string;
  source_type: WinnerSourceType;
  script_id?: string | null;

  // Content
  hook?: string | null;
  full_script?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  notes?: string | null;

  // Categorization
  hook_type?: HookType | null;
  content_format?: ContentFormat | null;
  product_category?: string | null;

  // Performance metrics
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  save_count?: number | null;
  engagement_rate?: number | null;

  // Retention
  retention_1s?: number | null;
  retention_3s?: number | null;
  retention_5s?: number | null;
  retention_10s?: number | null;
  avg_watch_time?: number | null;

  // AI analysis
  ai_analysis?: WinnerAIAnalysis | null;
  patterns?: ExtractedPatterns | null;

  // Scoring
  performance_score?: number | null;

  // Timestamps
  posted_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * AI-generated analysis of why a winner worked
 */
export interface WinnerAIAnalysis {
  summary: string;

  hook_analysis: {
    effectiveness_score: number; // 1-10
    what_worked: string;
    pattern: string;
    reusable_structure: string;
  };

  content_structure: {
    pacing: string;
    story_arc: string;
    product_integration: string;
    cta_effectiveness: string;
  };

  audience_psychology: {
    emotions_triggered: string[];
    why_people_shared: string;
    comment_drivers: string;
  };

  patterns: {
    hook_pattern: string;
    content_pattern: string;
    cta_pattern: string;
  };

  recommendations: string[];
  avoid: string[];
}

/**
 * Extracted patterns for prompt building
 */
export interface ExtractedPatterns {
  hook_pattern?: string;
  content_pattern?: string;
  cta_pattern?: string;
}

/**
 * Aggregated patterns from winner_patterns table
 */
export interface WinnerPatterns {
  id: string;
  user_id: string;

  top_hook_types?: Record<string, { count: number; avg_engagement: number }>;
  top_content_formats?: Record<string, { count: number; avg_engagement: number }>;
  optimal_video_length?: { min: number; max: number; sweet_spot: number };
  best_posting_times?: Record<string, number>;
  successful_hooks?: string[];
  common_patterns?: string[];
  underperforming_patterns?: string[];

  total_winners: number;
  avg_engagement_rate?: number;
  avg_views?: number;

  last_analyzed_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Intelligence bundle for script generation
 */
export interface WinnersIntelligence {
  winners: Winner[];
  patterns: WinnerPatterns | null;
  totalCount: number;
}

/**
 * Input for creating a new winner
 * Field names match the winners_bank table columns.
 */
export interface CreateWinnerInput {
  source_type: WinnerSourceType;
  script_id?: string;

  // Content
  hook?: string;
  full_script?: string;
  video_url?: string;
  thumbnail_url?: string;
  notes?: string;

  // Categorization
  hook_type?: HookType;
  content_format?: ContentFormat;
  product_category?: string;

  // Metrics
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  save_count?: number;
  engagement_rate?: number;

  // Retention
  retention_1s?: number;
  retention_3s?: number;
  retention_5s?: number;
  retention_10s?: number;
  avg_watch_time?: number;

  // Timestamps
  posted_at?: string;
}

/**
 * Input for updating a winner
 */
export interface UpdateWinnerInput extends Partial<CreateWinnerInput> {}

/**
 * Hook type options for UI
 */
export const HOOK_TYPE_OPTIONS: { value: HookType; label: string; example: string }[] = [
  { value: 'question', label: 'Question', example: '"Have you ever wondered...?"' },
  { value: 'bold_statement', label: 'Bold Statement', example: '"This changed everything"' },
  { value: 'pov', label: 'POV', example: '"POV: you just discovered..."' },
  { value: 'curiosity_gap', label: 'Curiosity Gap', example: '"I can\'t believe this worked"' },
  { value: 'controversy', label: 'Controversy', example: '"Unpopular opinion..."' },
  { value: 'relatable', label: 'Relatable', example: '"When you finally..."' },
  { value: 'shock', label: 'Shock/Surprise', example: '"Wait what if..."' },
  { value: 'story', label: 'Story Start', example: '"So this happened..."' },
  { value: 'list', label: 'Listicle', example: '"3 things you didn\'t know..."' },
  { value: 'challenge', label: 'Challenge', example: '"I tried X for 30 days"' },
];

/**
 * Content format options for UI
 */
export const CONTENT_FORMAT_OPTIONS: { value: ContentFormat; label: string }[] = [
  { value: 'skit', label: 'Skit/Dialogue' },
  { value: 'story', label: 'Storytelling' },
  { value: 'tutorial', label: 'Tutorial/How-To' },
  { value: 'review', label: 'Review/Reaction' },
  { value: 'comparison', label: 'Comparison/Dupe' },
  { value: 'transformation', label: 'Before/After' },
  { value: 'day_in_life', label: 'Day in the Life' },
  { value: 'grwm', label: 'GRWM/Routine' },
  { value: 'unboxing', label: 'Unboxing' },
  { value: 'trend', label: 'Trend/Sound' },
];

/**
 * Product category options
 */
export const PRODUCT_CATEGORY_OPTIONS = [
  'Beauty & Skincare',
  'Health & Wellness',
  'Fashion',
  'Tech & Gadgets',
  'Home & Kitchen',
  'Food & Beverage',
  'Fitness',
  'Baby & Kids',
  'Pet Products',
  'Other',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORY_OPTIONS)[number];

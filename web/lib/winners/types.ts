/**
 * Winners Bank Types
 *
 * Unified type definitions for the winners system
 */

// Source types for winners
export type WinnerSourceType = 'our_script' | 'external';

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
 */
export interface Winner {
  id: string;
  user_id: string;
  source_type: WinnerSourceType;
  script_id?: string | null;
  skit_id?: string | null;

  // Video details
  tiktok_url?: string | null;
  video_title?: string | null;
  thumbnail_url?: string | null;
  posted_at?: string | null;

  // Creator info (for external)
  creator_handle?: string | null;
  creator_niche?: string | null;

  // Performance metrics
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  engagement_rate?: number | null;

  // Retention
  avg_watch_time_seconds?: number | null;
  avg_watch_time_percent?: number | null;
  retention_3s?: number | null;
  retention_half?: number | null;
  retention_full?: number | null;

  // Content analysis
  product_name?: string | null;
  product_category?: string | null;
  hook_text?: string | null;
  hook_type?: HookType | null;
  content_format?: ContentFormat | null;
  video_length_seconds?: number | null;

  // User insights
  user_notes?: string | null;
  tags?: string[] | null;

  // AI analysis
  ai_analysis?: WinnerAIAnalysis | null;
  ai_analyzed_at?: string | null;
  extracted_patterns?: ExtractedPatterns | null;

  // Scoring
  performance_score?: number | null;

  // Meta
  is_active: boolean;
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
 */
export interface CreateWinnerInput {
  source_type: WinnerSourceType;
  script_id?: string;
  skit_id?: string;
  tiktok_url?: string;
  video_title?: string;
  thumbnail_url?: string;
  posted_at?: string;
  creator_handle?: string;
  creator_niche?: string;

  // Metrics
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;

  // Retention
  avg_watch_time_seconds?: number;
  avg_watch_time_percent?: number;
  retention_3s?: number;
  retention_half?: number;
  retention_full?: number;

  // Content
  product_name?: string;
  product_category?: string;
  hook_text?: string;
  hook_type?: HookType;
  content_format?: ContentFormat;
  video_length_seconds?: number;

  // User insights
  user_notes?: string;
  tags?: string[];
}

/**
 * Input for updating a winner
 */
export interface UpdateWinnerInput extends Partial<CreateWinnerInput> {
  is_active?: boolean;
}

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

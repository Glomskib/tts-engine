/**
 * Winners Engine Types
 */

export interface WinnerPatternRow {
  id: string;
  workspace_id: string;
  platform: string;
  product_id: string | null;
  hook_text: string | null;
  hook_pattern_id: string | null;
  format_tag: string | null;
  length_bucket: string | null;
  cta_tag: string | null;
  score: number;
  sample_size: number;
  avg_views: number;
  avg_engagement_rate: number;
  last_win_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  product_name?: string | null;
}

export interface WinnerPatternEvidence {
  id: string;
  winner_pattern_id: string;
  content_item_id: string | null;
  post_id: string | null;
  metric_snapshot_id: string | null;
  contribution_score: number;
  created_at: string;
}

export interface PostWithMetrics {
  post_id: string;
  content_item_id: string;
  platform: string;
  product_id: string | null;
  caption_used: string | null;
  posted_at: string | null;
  performance_score: string | null;
  // Latest metrics
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  avg_watch_time_seconds: number | null;
  completion_rate: number | null;
  metric_snapshot_id: string | null;
  // From content item
  title: string | null;
  // From AI insights
  hook_strength: number | null;
  hook_pattern: string | null;
  format_tag: string | null;
}

export type LengthBucket = 'micro' | 'short' | 'medium' | 'long';

export interface PatternKey {
  platform: string;
  product_id: string | null;
  hook_text: string | null;
  format_tag: string | null;
  length_bucket: string | null;
}

export interface DetectWinnersResult {
  patterns_upserted: number;
  evidence_inserted: number;
  posts_analyzed: number;
}

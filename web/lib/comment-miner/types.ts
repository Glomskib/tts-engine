/**
 * Comment Miner types — surfaces comment themes as content opportunities.
 *
 * Built on top of RI classified comments.
 */

export type ThemeCategory =
  | 'question'       // People keep asking this
  | 'objection'      // Pushback or skepticism
  | 'request'        // "Can you make a video about..."
  | 'pain_point'     // Frustrations people share
  | 'praise_pattern' // What people love (reusable angle)
  | 'controversy';   // Divisive takes worth addressing

export interface CommentTheme {
  id: string;
  user_id: string;
  /** Human-readable theme summary, e.g. "Does this actually work?" */
  theme: string;
  /** Which bucket */
  category: ThemeCategory;
  /** How many comments fall into this theme */
  comment_count: number;
  /** Representative example comments (3-5) */
  example_comments: ExampleComment[];
  /** One-sentence why this matters for content */
  content_angle: string;
  /** Suggested content types */
  suggested_actions: SuggestedAction[];
  /** 0-100 how good a content opportunity this is */
  opportunity_score: number;
  /** Source video IDs these comments came from */
  source_video_ids: string[];
  /** Has the user dismissed this theme? */
  dismissed: boolean;
  created_at: string;
}

export interface ExampleComment {
  text: string;
  username: string;
  like_count: number;
}

export interface SuggestedAction {
  type: 'reply_video' | 'hook' | 'script' | 'content_pack' | 'comment_reply';
  label: string;
}

/** What the mining API returns */
export interface MineResult {
  themes: CommentTheme[];
  total_comments_analyzed: number;
  source_videos: number;
}

/** DB row for persisted themes */
export interface CommentThemeRow {
  id: string;
  user_id: string;
  theme: string;
  category: ThemeCategory;
  comment_count: number;
  example_comments: ExampleComment[];
  content_angle: string;
  suggested_actions: SuggestedAction[];
  opportunity_score: number;
  source_video_ids: string[];
  dismissed: boolean;
  created_at: string;
}

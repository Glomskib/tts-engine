/**
 * Revenue Intelligence – Type Definitions
 *
 * Mirrors the SQL schema in 20260328000001_revenue_intelligence.sql.
 * All table types are prefixed with "Ri" to avoid collision.
 */

// ── Enums ──────────────────────────────────────────────────────

export const RI_PLATFORMS = ['tiktok'] as const;
export type RiPlatform = (typeof RI_PLATFORMS)[number];

export const RI_COMMENT_CATEGORIES = [
  'buying_intent',
  'objection',
  'shipping',
  'support',
  'praise',
  'troll',
  'general',
] as const;
export type RiCommentCategory = (typeof RI_COMMENT_CATEGORIES)[number];

export const RI_REPLY_TONES = ['neutral', 'friendly', 'conversion'] as const;
export type RiReplyTone = (typeof RI_REPLY_TONES)[number];

export const RI_COMMENT_STATUSES = ['unread', 'reviewed', 'resolved'] as const;
export type RiCommentStatusValue = (typeof RI_COMMENT_STATUSES)[number];

// ── Table Row Types ────────────────────────────────────────────

export interface RiCreatorAccount {
  id: string;
  user_id: string;
  platform: RiPlatform;
  username: string;
  profile_url: string | null;
  automation_profile_path: string | null;
  is_active: boolean;
  last_scan_at: string | null;
  created_at: string;
}

export interface RiVideo {
  id: string;
  user_id: string;
  creator_account_id: string | null;
  platform_video_id: string;
  caption: string | null;
  video_url: string | null;
  comment_count_at_scan: number | null;
  created_at: string;
}

export interface RiComment {
  id: string;
  user_id: string;
  video_id: string;
  platform_comment_id: string;
  comment_text: string;
  commenter_username: string;
  commenter_display_name: string | null;
  like_count: number;
  reply_count: number;
  is_reply: boolean;
  parent_comment_id: string | null;
  posted_at: string | null;
  ingested_at: string;
  raw_json: Record<string, unknown>;
  is_processed: boolean;
}

export interface RiCommentAnalysis {
  id: string;
  comment_id: string;
  category: RiCommentCategory;
  subcategory: string | null;
  lead_score: number;
  urgency_score: number;
  confidence_score: number;
  reasoning: string | null;
  created_at: string;
}

export interface RiReplyDraft {
  id: string;
  comment_id: string;
  tone: RiReplyTone;
  draft_text: string;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface RiCommentStatus {
  id: string;
  comment_id: string;
  status: RiCommentStatusValue;
  flagged_urgent: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiAgentLog {
  id: string;
  user_id: string | null;
  action_type: string;
  details: Record<string, unknown>;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ── Insert Types ───────────────────────────────────────────────

export type RiCreatorAccountInsert = Omit<RiCreatorAccount, 'id' | 'created_at' | 'last_scan_at'> & {
  id?: string;
  last_scan_at?: string;
};

export type RiVideoInsert = Omit<RiVideo, 'id' | 'created_at'> & { id?: string };

export type RiCommentInsert = Omit<RiComment, 'id' | 'ingested_at' | 'is_processed'> & {
  id?: string;
  is_processed?: boolean;
};

export type RiCommentAnalysisInsert = Omit<RiCommentAnalysis, 'id' | 'created_at'> & { id?: string };

export type RiReplyDraftInsert = Omit<RiReplyDraft, 'id' | 'created_at' | 'is_sent' | 'sent_at'> & {
  id?: string;
};

export type RiCommentStatusInsert = Omit<RiCommentStatus, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type RiAgentLogInsert = Omit<RiAgentLog, 'id' | 'created_at'> & { id?: string };

// ── Service Types ──────────────────────────────────────────────

/** Raw scraped comment from Playwright before DB insertion. */
export interface ScrapedComment {
  platform_comment_id: string;
  comment_text: string;
  commenter_username: string;
  commenter_display_name: string | null;
  like_count: number;
  reply_count: number;
  is_reply: boolean;
  parent_comment_id: string | null;
  posted_at: string | null;
  raw_json: Record<string, unknown>;
}

/** Raw scraped video metadata from Playwright. */
export interface ScrapedVideo {
  platform_video_id: string;
  caption: string | null;
  video_url: string;
  comment_count: number | null;
}

/** Result of a single video's comment scrape. */
export interface VideoScrapeResult {
  video: ScrapedVideo;
  comments: ScrapedComment[];
  errors: string[];
}

/** Full result of a comment ingestion run. */
export interface IngestionRunResult {
  account_id: string;
  username: string;
  videos_scanned: number;
  comments_found: number;
  comments_new: number;
  comments_duplicate: number;
  errors: string[];
  duration_ms: number;
}

/** AI classification output for a single comment. */
export interface ClassificationResult {
  category: RiCommentCategory;
  subcategory: string | null;
  lead_score: number;
  urgency_score: number;
  confidence_score: number;
  reasoning: string;
}

/** AI-generated reply drafts for a comment. */
export interface ReplyDraftSet {
  neutral: string;
  friendly: string;
  conversion: string;
}

/** Enriched comment for the inbox UI. */
export interface InboxComment {
  comment: RiComment;
  video: RiVideo;
  analysis: RiCommentAnalysis | null;
  drafts: RiReplyDraft[];
  status: RiCommentStatus;
}

/** Inbox query filters. */
export interface InboxFilters {
  user_id: string;
  status?: RiCommentStatusValue;
  category?: RiCommentCategory;
  min_lead_score?: number;
  flagged_urgent?: boolean;
  limit?: number;
  offset?: number;
}

/** Ingestion run configuration. */
export interface IngestionConfig {
  max_videos_per_account: number;
  max_comments_per_video: number;
  headless: boolean;
  simulation_mode: boolean;
}

export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  max_videos_per_account: 5,
  max_comments_per_video: 100,
  headless: true,
  simulation_mode: false,
};

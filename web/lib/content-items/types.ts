/**
 * Content Item types — canonical entity for the content lifecycle.
 */

import type { EditorNotesJSON } from './editor-notes-schema';

export type ContentItemStatus =
  | 'briefing'
  | 'ready_to_record'
  | 'recorded'
  | 'editing'
  | 'ready_to_post'
  | 'posted';

export const CONTENT_ITEM_STATUSES: ContentItemStatus[] = [
  'briefing',
  'ready_to_record',
  'recorded',
  'editing',
  'ready_to_post',
  'posted',
];

export type CowTier = 'safe' | 'edgy' | 'unhinged';

export type ProcessingStatus = 'none' | 'pending' | 'processing' | 'completed' | 'failed';

export interface EditorNotes {
  cut_suggestions: Array<{ start_ts: string; end_ts: string; reason: string }>;
  pause_removals: Array<{ start_ts: string; end_ts: string }>;
  mistake_removals: Array<{ start_ts: string; end_ts: string; note: string }>;
  jump_cut_opportunities: Array<{ ts: string; suggestion: string }>;
  broll_suggestions: Array<{ start_ts: string; end_ts: string; broll_idea: string }>;
  on_screen_text_timing: Array<{ ts: string; text: string; duration_s: number }>;
  editing_style: string;
  overall_notes: string;
}

export interface ContentItem {
  id: string;
  workspace_id: string;
  brand_id: string | null;
  product_id: string | null;
  video_id: string | null;
  title: string;
  status: ContentItemStatus;
  due_at: string | null;
  assigned_creator_id: string | null;
  assigned_editor_id: string | null;
  brief_selected_cow_tier: CowTier;
  short_id: string;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  brief_doc_id: string | null;
  brief_doc_url: string | null;
  raw_footage_drive_file_id: string | null;
  raw_footage_url: string | null;
  editor_notes_drive_doc_id: string | null;
  final_video_url: string | null;
  ai_description: string | null;
  hashtags: string[] | null;
  caption: string | null;
  editor_notes: EditorNotes | null;
  transcript_status: ProcessingStatus;
  editor_notes_status: ProcessingStatus;
  transcript_text: string | null;
  transcript_json: Array<{ start: number; end: number; text: string }> | null;
  transcript_error: string | null;
  editor_notes_text: string | null;
  editor_notes_json: EditorNotesJSON | null;
  editor_notes_error: string | null;
  raw_footage_received_at: string | null;
  last_processed_raw_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export type AssetKind = 'raw_footage' | 'transcript' | 'final_video' | 'broll' | 'editor_notes';
export type AssetSource = 'google_drive' | 'upload' | 'generated';

export interface ContentItemAsset {
  id: string;
  content_item_id: string;
  kind: AssetKind;
  source: AssetSource;
  file_id: string | null;
  file_name: string | null;
  file_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreatorBriefRow {
  id: string;
  content_item_id: string;
  version: number;
  created_by: string | null;
  data: Record<string, unknown>;
  claim_risk_score: number;
  created_at: string;
}

// ─── Content Intelligence Layer ──────────────────────────────────

export type PostPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'other';
export type PostStatus = 'posted' | 'deleted' | 'unknown';
export type MetricsSource = 'manual' | 'posting_provider' | 'platform_api';
export type InsightType = 'postmortem' | 'hook' | 'next' | 'winner_candidate' | 'post_package';

export const POST_PLATFORMS: PostPlatform[] = ['tiktok', 'instagram', 'youtube', 'facebook', 'other'];

export interface ContentItemPost {
  id: string;
  workspace_id: string;
  content_item_id: string;
  platform: PostPlatform;
  post_url: string;
  platform_post_id: string | null;
  product_id: string | null;
  caption_used: string | null;
  hashtags_used: string | null;
  posted_at: string | null;
  status: PostStatus;
  metrics_source: MetricsSource;
  performance_score: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricsSnapshot {
  id: string;
  workspace_id: string;
  content_item_post_id: string;
  captured_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  avg_watch_time_seconds: number | null;
  completion_rate: number | null;
  raw_json: Record<string, unknown> | null;
  source: MetricsSource;
}

export interface ContentItemAIInsight {
  id: string;
  workspace_id: string;
  content_item_id: string;
  content_item_post_id: string | null;
  generated_at: string;
  insight_type: InsightType;
  json: Record<string, unknown> | null;
  markdown: string | null;
}

/**
 * FlashFlow Footage Hub — TypeScript Types
 */

import type { FootageStage, FootageSourceType, FootageUploadedBy, TranscriptStatus } from './constants';

// ─── Core footage item ────────────────────────────────────────────────────────

export interface FootageItem {
  id: string;
  workspace_id: string;
  created_by: string | null;

  stage: FootageStage;

  original_filename: string;
  content_hash: string | null;
  storage_path: string | null;
  storage_provider: string;
  storage_url: string | null;
  thumbnail_url: string | null;

  byte_size: number | null;
  duration_sec: number | null;
  resolution: string | null;
  codec: string | null;
  mime_type: string;

  source_type: FootageSourceType;
  source_ref_id: string | null;
  uploaded_by: FootageUploadedBy;

  transcript_text: string | null;
  transcript_status: TranscriptStatus;
  keyframes: Keyframe[];
  ai_analysis: FootageAIAnalysis | null;

  auto_edit_eligible: boolean;
  auto_edit_requested_at: string | null;
  auto_edit_completed_at: string | null;

  parent_footage_id: string | null;
  version_num: number;

  content_item_id: string | null;
  render_job_id: string | null;

  metadata: Record<string, unknown>;
  failure_reason: string | null;

  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Related data ─────────────────────────────────────────────────────────────

export interface Keyframe {
  url: string;
  timestamp_sec: number;
}

export interface FootageAIAnalysis {
  hook?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  cover_text?: string;
  content_angle?: string;
  clip_scores?: number[];
  best_clip_index?: number;
  reasoning?: string;
}

export interface FootageEvent {
  id: string;
  footage_item_id: string;
  event_type: string;
  from_stage: FootageStage | null;
  to_stage: FootageStage | null;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ─── With joins ───────────────────────────────────────────────────────────────

export interface FootageItemWithRelations extends FootageItem {
  content_item?: {
    id: string;
    title: string;
    status: string;
    short_id: string | null;
  } | null;
  render_job?: {
    id: string;
    status: string;
    progress_pct: number;
    progress_message: string | null;
    node_id: string | null;
  } | null;
  parent_footage?: Pick<FootageItem, 'id' | 'original_filename' | 'stage' | 'storage_url'> | null;
  versions?: Pick<FootageItem, 'id' | 'original_filename' | 'stage' | 'storage_url' | 'version_num' | 'created_at'>[];
  events?: FootageEvent[];
}

// ─── API request/response shapes ──────────────────────────────────────────────

export interface CreateFootageItemInput {
  workspace_id: string;
  created_by?: string;
  original_filename: string;
  content_hash?: string;
  storage_path?: string;
  storage_url?: string;
  thumbnail_url?: string;
  byte_size?: number;
  duration_sec?: number;
  resolution?: string;
  codec?: string;
  mime_type?: string;
  source_type: FootageSourceType;
  source_ref_id?: string;
  uploaded_by?: FootageUploadedBy;
  content_item_id?: string;
  render_job_id?: string;
  auto_edit_eligible?: boolean;
  parent_footage_id?: string;
  version_num?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateFootageItemInput {
  stage?: FootageStage;
  thumbnail_url?: string;
  transcript_text?: string;
  transcript_status?: TranscriptStatus;
  keyframes?: Keyframe[];
  ai_analysis?: FootageAIAnalysis;
  content_item_id?: string;
  render_job_id?: string;
  auto_edit_eligible?: boolean;
  auto_edit_requested_at?: string;
  auto_edit_completed_at?: string;
  failure_reason?: string;
  metadata?: Record<string, unknown>;
  storage_url?: string;
  storage_path?: string;
  duration_sec?: number;
  resolution?: string;
}

export interface FootageListParams {
  workspace_id?: string;
  stage?: FootageStage | FootageStage[];
  source_type?: FootageSourceType;
  uploaded_by?: FootageUploadedBy;
  content_item_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
  include_deleted?: boolean;
  admin?: boolean; // skip workspace filter
}

export interface FootageListResponse {
  items: FootageItem[];
  total: number;
  has_more: boolean;
}

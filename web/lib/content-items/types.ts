/**
 * Content Item types — canonical entity for the content lifecycle.
 */

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

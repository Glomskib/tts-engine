/**
 * Opportunity Radar — Types
 */

export type CreatorPlatform = 'tiktok' | 'instagram' | 'youtube' | 'other';
export type CreatorPriority = 'low' | 'medium' | 'high' | 'critical';
export type ObservationConfidence = 'low' | 'medium' | 'high' | 'confirmed';
export type ObservationSource = 'manual' | 'import' | 'openclaw' | 'automation';
export type OpportunityStatus = 'new' | 'reviewed' | 'actioned' | 'dismissed';
export type OpportunityActionType = 'content_item' | 'experiment' | 'research';

export interface CreatorWatchlistEntry {
  id: string;
  workspace_id: string;
  handle: string;
  display_name: string | null;
  platform: CreatorPlatform;
  avatar_url: string | null;
  niche: string | null;
  follower_count: number | null;
  priority: CreatorPriority;
  is_active: boolean;
  notes: string | null;
  tags: string[];
  source: ObservationSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined counts
  observation_count?: number;
  opportunity_count?: number;
}

export interface ProductObservation {
  id: string;
  workspace_id: string;
  creator_id: string;
  product_name: string;
  product_url: string | null;
  product_image_url: string | null;
  brand_name: string | null;
  product_id: string | null;
  source_label: string | null;
  first_seen_at: string;
  last_seen_at: string;
  times_seen: number;
  creator_has_posted: boolean;
  observation_notes: string | null;
  confidence: ObservationConfidence;
  source: ObservationSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  creator?: Pick<CreatorWatchlistEntry, 'id' | 'handle' | 'display_name' | 'platform' | 'niche' | 'priority'>;
}

export interface ScoreBreakdown {
  recency: number;
  not_yet_posted: number;
  creator_priority: number;
  confidence: number;
  repeat_sightings: number;
  multi_creator: number;
  total: number;
  reasons: string[];
}

export interface Opportunity {
  id: string;
  workspace_id: string;
  observation_id: string;
  score: number;
  score_breakdown: ScoreBreakdown;
  status: OpportunityStatus;
  action_type: OpportunityActionType | null;
  action_ref_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  observation?: ProductObservation;
}

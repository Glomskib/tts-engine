/**
 * Types for the FlashFlow Marketing Engine.
 * Used by LateService, marketing scheduler, and repurpose pipeline.
 */

// ── Late.dev Account IDs ─────────────────────────────────────────
export const LATE_ACCOUNTS = {
  facebook: '699e6a2f8ab8ae478b4279b6',
  linkedin: '699e68698ab8ae478b42776e',
  pinterest: '699e66cc8ab8ae478b427553',
  reddit: '699e67788ab8ae478b42764b',
  tiktok: '699e65138ab8ae478b427330',
  twitter: '699e663d8ab8ae478b4274a2',
  youtube: '699e652b8ab8ae478b427341',
} as const;

export const FACEBOOK_PAGES = {
  makingMilesMatter: '553582747844417',
  zebbysWorld: '673094745879999',
} as const;

export type LatePlatform = keyof typeof LATE_ACCOUNTS;

// ── Post Types ───────────────────────────────────────────────────
export type PostStatus = 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled';
export type ContentType = 'feed' | 'story' | 'reel';
export type MediaType = 'image' | 'video';

export interface MediaItem {
  type: MediaType;
  url: string;
}

export interface PlatformTarget {
  platform: LatePlatform;
  accountId: string;
  platformSpecificData?: {
    contentType?: ContentType;
    title?: string;
    firstComment?: string;
    pageId?: string;
  };
}

export interface MarketingPost {
  id?: string;
  content: string;
  media_items: MediaItem[];
  platforms: PlatformTarget[];
  status: PostStatus;
  source: string;
  scheduled_for?: string;
  late_post_id?: string;
  claim_risk_score?: number;
  claim_risk_flags?: string[];
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

// ── LateService Request/Response ─────────────────────────────────
export interface LateCreateRequest {
  content: string;
  mediaItems?: MediaItem[];
  platforms: PlatformTarget[];
  publishNow?: boolean;
}

export interface LateCreateResponse {
  ok: boolean;
  postId?: string;
  error?: string;
}

export interface LateAccountHealth {
  accountId: string;
  platform: string;
  displayName: string;
  healthy: boolean;
}

export interface LateServiceResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ── Repurpose Pipeline ───────────────────────────────────────────
export interface RepurposeRequest {
  source_platform: LatePlatform;
  source_url: string;
  target_platforms: LatePlatform[];
  caption_override?: string;
  auto_publish: boolean;
}

export interface RepurposeResult {
  ok: boolean;
  posts_created: number;
  posts_failed: number;
  details: Array<{
    platform: LatePlatform;
    status: 'created' | 'failed';
    post_id?: string;
    error?: string;
  }>;
}

// ── Claim Risk ───────────────────────────────────────────────────
export interface ClaimRiskResult {
  score: number;        // 0-100
  flags: string[];      // e.g. ["health_claim", "unverified_stat"]
  safe: boolean;        // score < 30
  needs_review: boolean; // score >= 30 && score < 70
  blocked: boolean;     // score >= 70
  level: 'LOW' | 'MED' | 'HIGH';
  requires_human_approval: boolean; // true if MED or HIGH
}

// ── Marketing Schedule ───────────────────────────────────────────
export interface MarketingSchedule {
  id?: string;
  name: string;
  cron_expression: string;
  platforms: LatePlatform[];
  source_pipeline: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  meta?: Record<string, unknown>;
}
